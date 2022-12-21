// This handles sending images from one tab to another.

import Widget from 'vview/widgets/widget.js';
import DialogWidget from 'vview/widgets/dialog.js';
import { LocalBroadcastChannel } from 'vview/misc/local-api.js';
import { Timer } from 'vview/misc/helpers.js';
import { helpers } from 'vview/misc/helpers.js';

export default class SendImage
{
    constructor()
    {
        // This is a singleton, so we never close this channel.
        this.send_image_channel = new LocalBroadcastChannel("ppixiv:send-image");

        // A UUID we use to identify ourself to other tabs:
        this.tab_id = this.create_tab_id();
        this.tab_id_tiebreaker = Date.now()

        this.pending_movement = [0, 0];

        window.addEventListener("unload", this.window_onunload);

        // If we gain focus while quick view is active, finalize the image.  Virtual
        // history isn't meant to be left enabled, since it doesn't interact with browser
        // history.  On mobile, do this on any touch.
        window.addEventListener(ppixiv.mobile? "pointerdown":"focus", (e) => {
            this.finalize_quick_view_image();
        }, { capture: true });

        ppixiv.media_cache.addEventListener("mediamodified", ({media_id}) => { this.broadcast_illust_changes(media_id); });

        this.send_image_channel.addEventListener("message", this.received_message);
        this.broadcast_tab_info();

        // Ask other tabs to broadcast themselves, so we can see if we have a conflicting
        // tab ID.
        this.send_message({ message: "list-tabs" });
    }

    // Return true if this feature should be displayed.
    //
    // On desktop this can be used across tabs, and when native this can be used
    // across clients.  It isn't useful when on mobile and on Pixiv, since there's
    // nowhere for it to go.
    get enabled()
    {
        return ppixiv.native || !ppixiv.mobile;
    }

    create_tab_id(recreate=false)
    {
        // If we have a saved tab ID, use it.
        //
        // sessionStorage on Android Chrome is broken.  Home screen apps should retain session storage
        // for that particular home screen item, but they don't.  (This isn't a problem on iOS.)  Use
        // localStorage instead, which means things like linked tabs will link to the device instead of
        // the instance.  That's usually good enough if you're linking to a phone or tablet.
        let storage = ppixiv.android? localStorage:sessionStorage;
        if(!recreate && storage.ppixivTabId)
            return storage.ppixivTabId;

        // Make a new ID, and save it to the session.  This helps us keep the same ID
        // when we're reloaded.
        storage.ppixivTabId = helpers.create_uuid();
        return storage.ppixivTabId;
    }

    finalize_quick_view_image = () =>
    {
        let args = helpers.args.location;
        if(args.hash.has("temp-view"))
        {
            console.log("Finalizing quick view image because we gained focus");
            args.hash.delete("virtual");
            args.hash.delete("temp-view");
            helpers.navigate(args, { add_to_history: false });
        }
    }

    messages = new EventTarget();

    // If we're sending an image and the page is unloaded, try to cancel it.  This is
    // only registered when we're sending an image.
    window_onunload = (e) =>
    {
        // If we were sending an image to another tab, cancel it if this tab is closed.
        this.send_message({
            message: "send-image",
            action: "cancel",
            to: ppixiv.settings.get("linked_tabs", []),
        });
    }

    // Send an image to another tab.  action is either "temp-view", to show the image temporarily,
    // or "display", to navigate to it.
    async send_image(media_id, tab_ids, action)
    {
        // Send everything we know about the image, so the receiver doesn't have to
        // do a lookup.
        let media_info = ppixiv.media_cache.get_media_info_sync(media_id);

        let user_id = media_info?.userId;
        let user_info = user_id? ppixiv.user_cache.get_user_info_sync(user_id):null;

        this.send_message({
            message: "send-image",
            from: this.tab_id,
            to: tab_ids,
            media_id: media_id,
            action: action, // "temp-view" or "display"
            media_info,
            user_info: user_info,
            origin: window.origin,
        }, false);
    }

    broadcast_illust_changes(media_id)
    {
        // Don't do this if this is coming from another tab, so we don't re-broadcast data
        // we just received.
        if(this.handling_broadcasted_image_info)
            return;
        
        // Broadcast the new info to other tabs.
        this.broadcast_image_info(media_id);
    }

    // Send image info to other tabs.  We do this when we know about modifications to
    // an image that other tabs might be displaying, such as the like count and crop
    // info.  This isn't done when we simply load image data from the server, so we're
    // not constantly sending all search results to all tabs.  We don't currently update
    // thumbnail data from image data, so if a tab edits image data while it doesn't have
    // thumbnail data loaded, other tabs with only thumbnail data loaded won't see it.
    broadcast_image_info(media_id)
    {
        // Send everything we know about the image, so the receiver doesn't have to
        // do a lookup.
        let media_info = ppixiv.media_cache.get_media_info_sync(media_id);

        let user_id = media_info?.userId;
        let user_info = user_id? ppixiv.user_cache.get_user_info_sync(user_id):null;

        this.send_message({
            message: "image-info",
            from: this.tab_id,
            media_id: media_id,
            media_info,
            bookmark_tags: ppixiv.extra_cache.get_bookmark_details_sync(media_id),
            user_info: user_info,
            origin: window.origin,
        }, false);
    }

    received_message = async(e) =>
    {
        let data = e.data;

        // If this message has a target and it's not us, ignore it.
        if(data.to && data.to.indexOf(this.tab_id) == -1)
            return;

        let event = new Event(data.message);
        event.message = data;
        this.messages.dispatchEvent(event);

        if(data.message == "tab-info")
        {
            if(data.from == this.tab_id)
            {
                // The other tab has the same ID we do.  The only way this normally happens
                // is if a tab is duplicated, which will duplicate its sessionStorage with it.
                // If this happens, use tab_id_tiebreaker to decide who wins.  The tab with
                // the higher value will recreate its tab ID.  This is set to the time when
                // we're loaded, so this will usually cause new tabs to be the one to create
                // a new ID.
                if(this.tab_id_tiebreaker >= data.tab_id_tiebreaker)
                {
                    console.log("Creating a new tab ID due to ID conflict");
                    this.tab_id = this.create_tab_id(true /* recreate */ );
                }
                else
                    console.log("Tab ID conflict (other tab will create a new ID)");

                // Broadcast info.  If we recreated our ID then we want to broadcast it on the
                // new ID.  If we didn't, we still want to broadcast it to replace the info
                // the other tab just sent on our ID.
                this.broadcast_tab_info();
            }
        }
        else if(data.message == "list-tabs")
        {
            // A new tab opened, and is asking for other tabs to broadcast themselves to check for
            // tab ID conflicts.
            this.broadcast_tab_info();
        }
        else if(data.message == "send-image")
        {
            // If this message has illust info or thumbnail info and it's on the same origin,
            // register it.
            if(data.origin == window.origin)
            {
                console.log("Registering cached image info");
                let user_info = data.user_info;
                if(user_info != null)
                    ppixiv.user_cache.add_user_data(user_info);

                let media_info = data.media_info;
                if(media_info != null)
                    ppixiv.media_cache.add_media_info_full(media_info, { preprocessed: true });
            }
            // To finalize, just remove preview and quick-view from the URL to turn the current
            // preview into a real navigation.  This is slightly different from sending "display"
            // with the illust ID, since it handles navigation during quick view.
            if(data.action == "finalize")
            {
                let args = helpers.args.location;
                args.hash.delete("virtual");
                args.hash.delete("temp-view");
                helpers.navigate(args, { add_to_history: false });
                return;
            }

            if(data.action == "cancel")
            {
                this.hide_preview_image();
                return;
            }

            // Otherwise, we're displaying an image.  quick-view displays in quick-view+virtual
            // mode, display just navigates to the image normally.
            console.assert(data.action == "temp-view" || data.action == "display", data.actionj);

            // Show the image.
            ppixiv.app.show_media(data.media_id, {
                temp_view: data.action == "temp-view",
                source: "temp-view",

                // When we first show a preview, add it to history.  If we show another image
                // or finalize the previewed image while we're showing a preview, replace the
                // preview history entry.
                add_to_history: !ppixiv.phistory.virtual,
            });
        }
        else if(data.message == "image-info")
        {
            if(data.origin != window.origin)
                return;

            // update_media_info will trigger mediamodified below.  Make sure we don't rebroadcast
            // info that we're receiving here.  Note that add_media_info_full can trigger loads, and we won't
            // send any info for changes that happen before those complete since we have to wait
            // for it to finish, but normally this receives all info for an illust anyway.
            this.handling_broadcasted_image_info = true;
            try {
                // Another tab is broadcasting updated image info.  If we have this image loaded,
                // update it.
                let media_info = data.media_info;
                if(media_info != null)
                    ppixiv.media_cache.update_media_info(data.media_id, media_info);

                let bookmark_tags = data.bookmark_tags;
                if(bookmark_tags != null)
                    ppixiv.extra_cache.update_cached_bookmark_image_tags(data.media_id, bookmark_tags);

                let user_info = data.user_info;
                if(user_info != null)
                    ppixiv.user_cache.add_user_data(user_info);
            } finally {
                this.handling_broadcasted_image_info = false;
            }
        }
        else if(data.message == "preview-mouse-movement")
        {
            // Ignore this message if we're not displaying a quick view image.
            if(!ppixiv.phistory.virtual)
                return;
            
            // The mouse moved in the tab that's sending quick view.  Broadcast an event
            // like pointermove.  We have to work around a stupid pair of bugs: Safari
            // doesn't handle setting movementX/movementY in the constructor, and Firefox
            // *only* handles it that way, throwing an error if you try to set it manually.
            let event = new PointerEvent("quickviewpointermove", {
                movementX: data.x,
                movementY: data.y,
            });

            if(event.movementX == null)
            {
                event.movementX = data.x;
                event.movementY = data.y;
            }

            window.dispatchEvent(event);
        }
    }

    broadcast_tab_info = () =>
    {
        let our_tab_info = {
            message: "tab-info",
            tab_id_tiebreaker: this.tab_id_tiebreaker,
        };

        this.send_message(our_tab_info);
    }

    send_message(data, send_to_self)
    {
        // Include the tab ID in all messages.
        data.from = this.tab_id;
        this.send_image_channel.postMessage(data);

        if(send_to_self)
        {
            // Make a copy of data, so we don't modify the caller's copy.
            data = JSON.parse(JSON.stringify(data));

            // Set self to true to let us know that this is our own message.
            data.self = true;
            this.send_image_channel.dispatchEvent(new MessageEvent("message", { data: data }));
        }
    }

    // If we're currently showing a preview image sent from another tab, back out to
    // where we were before.
    hide_preview_image()
    {
        let was_in_preview = ppixiv.phistory.virtual;
        if(!was_in_preview)
            return;

        ppixiv.phistory.back();        
    }

    send_mouse_movement_to_linked_tabs(x, y)
    {
        if(!ppixiv.settings.get("linked_tabs_enabled"))
            return;

        let tab_ids = ppixiv.settings.get("linked_tabs", []);
        if(tab_ids.length == 0)
            return;

        this.pending_movement[0] += x;
        this.pending_movement[1] += y;

        // Limit the rate we send these, since mice with high report rates can send updates
        // fast enough to saturate BroadcastChannel and cause messages to back up.  Add up
        // movement if we're sending too quickly and batch it into the next message.
        if(this.last_movement_message_time != null && Date.now() - this.last_movement_message_time < 10)
            return;

        this.last_movement_message_time = Date.now();

        this.send_message({
            message: "preview-mouse-movement",
            x: this.pending_movement[0],
            y: this.pending_movement[1],
            to: tab_ids,
        }, false);
        
        this.pending_movement = [0, 0];
    }
};

export class LinkTabsPopup extends Widget
{
    constructor({...options})
    {
        super({...options,
            classes: "link-tab-popup",
            template: `
            <div class="link-tab-popup">
                <div class=explanation>
                    <ppixiv-inline src="resources/multi-monitor.svg" class=tutorial-monitor></ppixiv-inline>
                    <div style="margin: 10px 0 15px 0; font-size: 125%;">
                        Open a 
                        <img src="ppixiv:resources/activate-icon.png" style="width: 28px; vertical-align: bottom;">
                        tab on another monitor and click "Link this tab" to send images to it
                    </div>
                </div>
            </div>
        `});
    }

    // Send show-link-tab to tell other tabs to display the "link this tab" popup.
    // This includes the linked tab list, so they know whether to say "link" or "unlink".
    send_link_tab_message = () =>
    {
        if(!this.visible)
            return;

        ppixiv.send_image.send_message({
            message: "show-link-tab",
            linked_tabs: ppixiv.settings.get("linked_tabs", []),
        });
    }

    visibility_changed()
    {
        super.visibility_changed();

        if(!this.visible)
        {
            ppixiv.send_image.send_message({ message: "hide-link-tab" });
            return;
        }

        helpers.interval(this.send_link_tab_message, 1000, this.visibility_abort.signal);

        // Refresh the "unlink all tabs" button on other tabs when the linked tab list changes.
        ppixiv.settings.addEventListener("linked_tabs", this.send_link_tab_message, { signal: this.visibility_abort.signal });

        // The other tab will send these messages when the link and unlink buttons
        // are clicked.
        ppixiv.send_image.messages.addEventListener("link-this-tab", (e) => {
            let message = e.message;

            let tab_ids = ppixiv.settings.get("linked_tabs", []);
            if(tab_ids.indexOf(message.from) == -1)
                tab_ids.push(message.from);

            ppixiv.settings.set("linked_tabs", tab_ids);

            this.send_link_tab_message();
        }, this._signal);

        ppixiv.send_image.messages.addEventListener("unlink-this-tab", (e) => {
            let message = e.message;
            let tab_ids = ppixiv.settings.get("linked_tabs", []);
            let idx = tab_ids.indexOf(message.from);
            if(idx != -1)
                tab_ids.splice(idx, 1);

            ppixiv.settings.set("linked_tabs", tab_ids);

            this.send_link_tab_message();
        }, this._signal);
    }
}

export class LinkThisTabPopup extends DialogWidget
{
    static setup()
    {
        let hide_timer = new Timer(() => {
            this.visible = false;
        });
        
        let dialog = null;
        
        // Show ourself when we see a show-link-tab message and hide if we see a
        // hide-link-tab-message.
        ppixiv.send_image.messages.addEventListener("show-link-tab", ({message}) => {
            LinkThisTabPopup.other_tab_id = message.from;
            hide_timer.set(2000);

            if(dialog != null)
                return;

            dialog = new LinkThisTabPopup({ message });

            dialog.shutdown_signal.signal.addEventListener("abort", () => {
                hide_timer.clear();
                dialog = null;
            });

            ppixiv.send_image.messages.addEventListener("hide-link-tab", ({message}) => {
                // Close the dialog if it's running.
                if(dialog)
                    dialog.visible = false;
            }, dialog._signal);
        });
    }

    constructor({
        message,
        ...options
    }={})
    {
        super({...options,
            dialog_class: "simple-button-dialog",
            dialog_type: "small",

            // This dialog is closed when the sending tab closes the link tab interface.
            allow_close: false,

            template: `
                ${ helpers.create_box_link({ label: "Link this tab", classes: ["link-this-tab"]}) }
                ${ helpers.create_box_link({ label: "Unlink this tab", classes: ["unlink-this-tab"]}) }
            `
        });

        this.link_this_tab = this.querySelector(".link-this-tab");
        this.unlink_this_tab = this.querySelector(".unlink-this-tab");
        this.link_this_tab.hidden = true;
        this.unlink_this_tab.hidden = true;

        // Show ourself when we see a show-link-tab message and hide if we see a
        // hide-link-tab-message.
        ppixiv.send_image.messages.addEventListener("show-link-tab", ({message}) => this.showLinkTabMessage({message}), this._signal);

        // When "link this tab" is clicked, send a link-this-tab message.
        this.link_this_tab.addEventListener("click", (e) => {
            ppixiv.send_image.send_message({ message: "link-this-tab", to: [LinkThisTabPopup.other_tab_id] });

            // If we're linked to another tab, clear our linked tab list, to try to make
            // sure we don't have weird chains of tabs linking each other.
            ppixiv.settings.set("linked_tabs", []);
        }, this._signal);

        this.unlink_this_tab.addEventListener("click", (e) => {
            ppixiv.send_image.send_message({ message: "unlink-this-tab", to: [LinkThisTabPopup.other_tab_id] });
        }, this._signal);
        
        this.showLinkTabMessage({message});
    }

    showLinkTabMessage({message})
    {
        let linked = message.linked_tabs.indexOf(ppixiv.send_image.tab_id) != -1;
        this.link_this_tab.hidden = linked;
        this.unlink_this_tab.hidden = !linked;
    }
}

export class SendImagePopup extends DialogWidget
{
    constructor({media_id, ...options}={})
    {
        super({...options,
            show_close_button: false,
            dialog_type: "small",

            template: `
                <div>
                    Click a
                    <img src="ppixiv:resources/activate-icon.png" style="width: 28px; vertical-align: bottom;">
                    tab to send the image there
                </div>
        `});

        // Close if the container is clicked, but not if something inside the container is clicked.
        this.container.addEventListener("click", (e) => {
            if(e.target != this.container)
                return;

            this.visible = false;
        });

        // Periodically send show-send-image to tell other tabs to show SendHerePopup.
        // If they're clicked, they'll send take-image.
        helpers.interval(() => {
            // We should always be visible when this is called.
            console.assert(this.visible);

            ppixiv.send_image.send_message({ message: "show-send-image" });
        }, 1000, this.shutdown_signal.signal);

        ppixiv.send_image.messages.addEventListener("take-image", ({message}) => {
            let tab_id = message.from;
            ppixiv.send_image.send_image(media_id, [tab_id], "display");

            this.visible = false;
        }, this._signal);
    }

    shutdown()
    {
        super.shutdown();

        ppixiv.send_image.send_message({ message: "hide-send-image" });
    }
}

export class SendHerePopup extends DialogWidget
{
    static setup()
    {
        // Show ourself when we see a show-link-tab message and hide if we see a
        // hide-link-tab-message.
        let hide_timer = new Timer(() => {
            this.visible = false;
        });

        let dialog = null;
        ppixiv.send_image.messages.addEventListener("show-send-image", ({message}) => {
            SendHerePopup.other_tab_id = message.from;
            hide_timer.set(2000);

            if(dialog == null)
            {
                dialog = new SendHerePopup();
                dialog.shutdown_signal.signal.addEventListener("abort", () => {
                    hide_timer.clear();
                    dialog = null;
                });
            }
        }, this._signal);

        ppixiv.send_image.messages.addEventListener("hide-send-image", ({message}) => {
            // Close the dialog if it's running.
            if(dialog)
                dialog.visible = false;
        }, this._signal);
    }

    constructor({...options}={})
    {
        super({...options,
            dialog_class: "simple-button-dialog",
            small: true,

            // This dialog is closed when the sending tab closes the send image interface.
            allow_close: false,
            template: `
                ${ helpers.create_box_link({ label: "Click to send image here", classes: ["link-this-tab"]}) }
        `});

        window.addEventListener("click", this.take_image, { signal: this.shutdown_signal.signal });
    }

    take_image = (e) =>
    {
        // Send take-image.  The sending tab will respond with a send-image message.
        ppixiv.send_image.send_message({ message: "take-image", to: [SendHerePopup.other_tab_id] });
    }
}