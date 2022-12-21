// A global right-click popup menu.
//
// This is only active when right clicking over items with the context-menu-target
// class.
//
// Not all items are available all the time.  This is a singleton class, so it's easy
// for different parts of the UI to tell us when they're active.
//
// This also handles mousewheel zooming.

import Widget from 'vview/widgets/widget.js';
import { BookmarkButtonWidget, BookmarkCountWidget, LikeButtonWidget, LikeCountWidget } from 'vview/widgets/illust-widgets.js';
import { HideMouseCursorOnIdle } from 'vview/util/hide-mouse-cursor-on-idle.js';
import { BookmarkTagDropdownOpener } from 'vview/widgets/bookmark-tag-list.js';
import { AvatarWidget } from 'vview/widgets/user-widgets.js';
import MoreOptionsDropdown from 'vview/widgets/more-options-dropdown.js';
import { ViewInExplorerWidget } from 'vview/widgets/local-widgets.js';
import { IllustWidget } from 'vview/widgets/illust-widgets.js';
import PointerListener from 'vview/actors/pointer-listener.js';
import { DropdownBoxOpener } from 'vview/widgets/dropdown.js';
import ClickOutsideListener from 'vview/widgets/click-outside-listener.js';
import Actions from 'vview/misc/actions.js';
import { getUrlForMediaId } from 'vview/misc/media-ids.js'
import LocalAPI from 'vview/misc/local-api.js';
import { helpers, ClassFlags, KeyListener, OpenWidgets } from 'vview/misc/helpers.js';

export default class ContextMenu extends Widget
{
    // Names for buttons, for storing in this.buttons_down.
    buttons = ["lmb", "rmb", "mmb"];

    constructor({...options})
    {
        super({...options, template: `
            <div class=popup-context-menu>
                <div class=button-strip>
                    <div class="button-block shift-right">
                        <div class="button button-view-manga" data-popup="View manga pages">
                            ${ helpers.create_icon("ppixiv:thumbnails") }
                        </div>
                    </div>

                    <div class=button-block>
                        <div class="button button-fullscreen enabled" data-popup="Fullscreen">
                            <ppixiv-inline src="resources/fullscreen.svg"></ppixiv-inline>
                        </div>
                    </div>
                    <div class=context-menu-image-info-container></div>
                </div>
                <div class=button-strip>
                    <div class=button-block>
                        <div class="button button-browser-back enabled" data-popup="Back" style="transform: scaleX(-1);">
                            <ppixiv-inline src="resources/exit-icon.svg"></ppixiv-inline>
                        </div>
                    </div>
                    <div class=button-block>
                        <div class="button requires-zoom button-zoom" data-popup="Mousewheel to zoom">
                            <ppixiv-inline src="resources/zoom-plus.svg"></ppixiv-inline>
                            <ppixiv-inline src="resources/zoom-minus.svg"></ppixiv-inline>
                        </div>
                    </div>
                    <div class=button-block>
                        <div class="button requires-zoom button-zoom-level" data-level="cover" data-popup="Zoom to cover">
                            <ppixiv-inline src="resources/zoom-full.svg"></ppixiv-inline>
                        </div>
                    </div>
                    <div class=button-block>
                        <div class="button requires-zoom button-zoom-level" data-level="actual" data-popup="Zoom to actual size">
                            <ppixiv-inline src="resources/zoom-actual.svg"></ppixiv-inline>
                        </div>
                    </div>
                    <div class=button-block>
                        <div class="button button-more enabled" data-popup="More...">
                            ${ helpers.create_icon("settings") }
                        </div>
                    </div>
                </div>
                <div class=button-strip>
                    <div class=button-block>
                        <div class="avatar-widget-container"></div>

                        <div class="button button-parent-folder enabled" data-popup="Parent folder" hidden>
                            ${ helpers.create_icon("folder") }
                        </div>
                    </div>

                    <div class="button-block view-in-explorer button-container" hidden>
                        <a href=# class="button private popup local-link">
                            ${ helpers.create_icon("description") }
                        </a>
                    </div>

                    <div class="button-block button-container">
                        <!-- position: relative positions the bookmark count. -->
                        <div class="button button-bookmark public" data-bookmark-type=public style="position: relative;">
                            <ppixiv-inline src="resources/heart-icon.svg"></ppixiv-inline>

                            <div class=count></div>
                        </div>
                    </div>

                    <div class="button-block button-container">
                        <div class="button button-bookmark private" data-bookmark-type=private>
                            <ppixiv-inline src="resources/heart-icon.svg"></ppixiv-inline>
                        </div>
                    </div>
                    
                    <div class=button-block>
                        <div class="button button-bookmark-tags" data-popup="Bookmark tags">
                            ${ helpers.create_icon("ppixiv:tag") }
                        </div>
                    </div>

                    <div class="button-block button-container">
                        <div class="button button-like enabled" style="position: relative;">
                            <ppixiv-inline src="resources/like-button.svg"></ppixiv-inline>

                            <div class=count></div>
                        </div>
                    </div>
                </div>

                <div class=tooltip-display>
                    <div class=tooltip-display-text></div>
                </div>
            </div>
        `});

        this.visible = false;
        this.hide = this.hide.bind(this);
        this._current_viewer = null;
        this._media_id = null;

        // Whether the left and right mouse buttons are pressed:
        this.buttons_down = {};

        // This UI isn't used on mobile, but we're still created so other code doesn't need
        // to check if we exist.
        if(ppixiv.mobile)
            return;
            
        this.pointerListener = new PointerListener({
            element: window,
            button_mask: 0b11,
            callback: this.pointerevent,
        });
        
        window.addEventListener("keydown", this.onkeyevent);
        window.addEventListener("keyup", this.onkeyevent);

        // Use key_listener to watch for ctrl being held.
        new KeyListener("Control", this.ctrl_pressed);

        // Work around glitchiness in Chrome's click behavior (if we're in Chrome).
        // XXX
        (async() => {
            let { default: FixChromeClicks } = await ppixiv.importModule("vview/misc/fix-chrome-clicks.js");
            new FixChromeClicks(this.container);
        })();

        this.container.addEventListener("mouseover", this.onmouseover, true);
        this.container.addEventListener("mouseout", this.onmouseout, true);

        // If the page is navigated while the popup menu is open, clear the ID the
        // user clicked on, so we refresh and show the default.
        window.addEventListener("pp:popstate", (e) => {
            if(this._clicked_media_id == null)
                return;

            this._set_temporary_illust(null);
        });

        this.button_view_manga = this.container.querySelector(".button-view-manga");
        this.button_view_manga.addEventListener("click", this.clicked_view_manga);

        this.button_fullscreen = this.container.querySelector(".button-fullscreen");
        this.button_fullscreen.addEventListener("click", this.clicked_fullscreen);

        this.container.querySelector(".button-zoom").addEventListener("click", this.clicked_zoom_toggle);
        this.container.querySelector(".button-browser-back").addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            ppixiv.phistory.back();
        });

        this.container.addEventListener("click", this.handle_link_click);
        this.container.querySelector(".button-parent-folder").addEventListener("click", this.clicked_go_to_parent);

        for(var button of this.container.querySelectorAll(".button-zoom-level"))
            button.addEventListener("click", this.clicked_zoom_level);

        this.avatarWidget = new AvatarWidget({
            container: this.container.querySelector(".avatar-widget-container"),
            mode: "overlay",
        });

        // Set up the more options dropdown.
        let more_options_button = this.container.querySelector(".button-more");
        this.more_options_dropdown_opener = new DropdownBoxOpener({
            button: more_options_button,

            create_box: ({...options}) => {
                let dropdown = new MoreOptionsDropdown({
                    ...options,
                    parent: this,
                    show_extra: this.alt_pressed,
                });

                dropdown.container.classList.add("popup-more-options-dropdown");
                dropdown.set_media_id(this.effective_media_id);
                dropdown.setUserId(this.effective_user_id);

                return dropdown;
            },
        });

        more_options_button.addEventListener("click", (e) => {
            // Show rarely-used options if alt was pressed.
            this.alt_pressed = e.altKey;
            this.more_options_dropdown_opener.visible = !this.more_options_dropdown_opener.visible;
        });

        this.illust_widgets = [
            this.avatarWidget,
            new LikeButtonWidget({
                contents: this.container.querySelector(".button-like"),
            }),
            new LikeCountWidget({
                contents: this.container.querySelector(".button-like .count"),
            }),
            new ImageInfoWidget({
                container: this.container.querySelector(".context-menu-image-info-container"),
            }),
            new BookmarkCountWidget({
                contents: this.container.querySelector(".button-bookmark.public .count")
            }),
        ];

        this.illust_widgets.push(new ViewInExplorerWidget({
            contents: this.container.querySelector(".view-in-explorer"),
        }));

        // The bookmark buttons, and clicks in the tag dropdown:
        this.bookmark_buttons = [];
        for(let a of this.container.querySelectorAll("[data-bookmark-type]"))
        {
            // The bookmark buttons, and clicks in the tag dropdown:
            let bookmark_widget = new BookmarkButtonWidget({
                contents: a,
                bookmark_type: a.dataset.bookmarkType,
            });

            this.bookmark_buttons.push(bookmark_widget);
            this.illust_widgets.push(bookmark_widget);
        }

        // Set up the bookmark tags dropdown.
        this.bookmark_tags_dropdown_opener = new BookmarkTagDropdownOpener({
            parent: this,
            bookmark_tags_button: this.container.querySelector(".button-bookmark-tags"),
            bookmark_buttons: this.bookmark_buttons,
        });
        this.illust_widgets.push(this.bookmark_tags_dropdown_opener);

        this.refresh();
    }

    _context_menu_enabled_for_element(element)
    {
        let target = element.closest("[data-context-menu-target]");
        if(target == null || target.dataset.contextMenuTarget == "off")
            return false;
        else
            return true;
    }

    pointerevent = (e) =>
    {
        if(e.pressed)
        {
            if(!this.visible && !this._context_menu_enabled_for_element(e.target))
                return;
            
            if(!this.visible && e.mouseButton != 1)
                return;

            let button_name = this.buttons[e.mouseButton];
            if(button_name != null)
                this.buttons_down[button_name] = true;
            if(e.mouseButton != 1)
                return;

            // If invert-popup-hotkey is true, hold shift to open the popup menu.  Otherwise,
            // hold shift to suppress the popup menu so the browser context menu will open.
            //
            // Firefox doesn't cancel the context menu if shift is pressed.  This seems like a
            // well-intentioned but deeply confused attempt to let people override pages that
            // block the context menu, making it impossible for us to let you choose context
            // menu behavior and probably making it impossible for games to have sane keyboard
            // behavior at all.
            this.shift_was_pressed = e.shiftKey;
            if(navigator.userAgent.indexOf("Firefox/") == -1 && ppixiv.settings.get("invert-popup-hotkey"))
                this.shift_was_pressed = !this.shift_was_pressed;
            if(this.shift_was_pressed)
                return;

            e.preventDefault();
            e.stopPropagation();

            if(this.toggle_mode && this.visible)
                this.hide();
            else
                this.show({x: e.clientX, y: e.clientY, target: e.target});
        } else {
            // Releasing the left or right mouse button hides the menu if both the left
            // and right buttons are released.  Pressing right, then left, then releasing
            // right won't close the menu until left is also released.  This prevents lost
            // inputs when quickly right-left clicking.
            if(!this.visible)
                return;

            let button_name = this.buttons[e.mouseButton];
            if(button_name != null)
                this.buttons_down[button_name] = false;

            this.hide_if_all_buttons_released();
        }
    }

    // If true, RMB toggles the menu instead of displaying while held, and we'll also hide the
    // menu if the mouse moves too far away.
    get toggle_mode()
    {
        return ppixiv.settings.get("touchpad-mode", false);
    }

    // The subclass can override this to handle key events.  This is called whether the menu
    // is open or not.
    handle_key_event(e) { return false; }

    onkeyevent = (e) =>
    {
        if(e.repeat)
            return;

        // Don't eat inputs if we're inside an input.
        if(e.target.closest("input, textarea, [contenteditable]"))
            return;

        // Let the subclass handle events.
        if(this.handle_key_event(e))
        {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
    }

    _get_hovered_element()
    {
        let x = PointerListener.latest_mouse_client_position[0];
        let y = PointerListener.latest_mouse_client_position[1];
        return document.elementFromPoint(x, y);
    }

    ctrl_pressed = (down) =>
    {
        if(!ppixiv.settings.get("ctrl_opens_popup"))
            return;

        this.buttons_down["Control"] = down;

        if(down)
        {
            let x = PointerListener.latest_mouse_client_position[0];
            let y = PointerListener.latest_mouse_client_position[1];
            let node = this._get_hovered_element();
            this.show({x, y, target: node});
        } else {
            this.hide_if_all_buttons_released();
        }
    }

    // This is called on mouseup, and when keyboard shortcuts are released.  Hide the menu if all buttons
    // that can open the menu have been released.
    hide_if_all_buttons_released()
    {
        if(this.toggle_mode)
            return;

        if(!this.buttons_down["lmb"] && !this.buttons_down["rmb"] && !this.buttons_down["Control"])
            this.hide();
    }

    window_onblur = (e) =>
    {
        this.hide();
    }

    // Return the element that should be under the cursor when the menu is opened.
    get elementToCenter()
    {
        return null;
    }

    show({x, y, target})
    {
        // See if the click is inside a viewer_images.
        let widget = Widget.from_node(target, { allow_none: true });
        this._current_viewer = null;
        if(widget)
        {
            // To avoid importing viewer_images here, just look for a widget in the tree
            // with zoom_toggle.
            for(let parent of widget.ancestors({include_self: true}))
            {
                if(parent.zoom_toggle != null)
                {
                    this._current_viewer = parent;
                    break;
                }
            }
        }


        // If RMB is pressed while dragging LMB, stop dragging the window when we
        // show the popup.
        if(this._current_viewer != null)
            this._current_viewer.stopDragging();

        // See if an element representing a user and/or an illust was under the cursor.
        if(target != null)
        {
            let { mediaId } = ppixiv.app.get_illust_at_element(target);
            this._set_temporary_illust(mediaId);
        }

        if(this.visible)
            return;

        this.pointerListener.check_missed_clicks();

        this.displayed_menu = this.container;
        this.visible = true;
        this.apply_visibility();

        // Disable popup UI while a context menu is open.
        ClassFlags.get.set("hide-ui", true);
        
        window.addEventListener("blur", this.window_onblur);

        // Disable all dragging while the context menu is open, since drags cause browsers to
        // forget to send mouseup events, which throws things out of whack.  We don't use
        // drag and drop and there's no real reason to use it while the context menu is open.
        window.addEventListener("dragstart", this.cancel_event, true);

        // In toggle mode, close the popup if anything outside is clicked.
        if(this.toggle_mode && this.clickOutsideListener == null)
        {
            this.clickOutsideListener = new ClickOutsideListener([this.container], () => {
                this.hide();
            });
        }

        var centered_element = this.elementToCenter;
        if(centered_element == null)
            centered_element = this.displayed_menu;

        // The center of the centered element, relative to the menu.  Shift the center
        // down a bit in the button.
        var pos = helpers.get_relative_pos(centered_element, this.displayed_menu);
        pos[0] += centered_element.offsetWidth / 2;
        pos[1] += centered_element.offsetHeight * 3 / 4;
        x -= pos[0];
        y -= pos[1];

        this.popup_position = { x, y };
        this.set_current_position();

        // Start listening for the window moving.
        this.add_window_movement_listeneres();

        // Adjust the fade-in so it's centered around the centered element.
        this.displayed_menu.style.transformOrigin = (pos[0]) + "px " + (pos[1]) + "px";

        HideMouseCursorOnIdle.disable_all("context-menu");

        // Make sure we're up to date if we deferred an update while hidden.
        this.refresh();
    }

    set_current_position()
    {
        let { x, y } = this.popup_position;

        if(this._current_viewer == null)
        {
            // If we can't zoom, adjust the popup position so it doesn't go over the right and
            // bottom of the screen, with a bit of padding so we're not flush with the edge and
            // so the popup text is visible.
            //
            // If zooming is enabled (we're viewing an image), always align to the same place,
            // so the cursor is always over the zoom toggle button.
            let window_width = window.innerWidth - 4;
            let window_height = window.innerHeight - 20;
            x = Math.min(x, window_width - this.displayed_menu.offsetWidth);
            y = Math.min(y, window_height - this.displayed_menu.offsetHeight);
        }

        this.displayed_menu.style.left = `${x}px`;
        this.displayed_menu.style.top = `${y}px`;
    }

    // Try to keep the context menu in the same place on screen when we toggle fullscreen.
    //
    // To do this, we need to know when the position of the client area on the screen changes.
    // There are no APIs to query this directly (window.screenX/screenY don't work, those are
    // the position of the window rather than the client area).  Figure it out by watching
    // mouse events, and comparing the client and screen position of the cursor.  If it's 100x50, the
    // client area is at 100x50 on the screen.
    //
    // It's not perfect, but it helps keep the context menu from being way off in another part
    // of the screen after toggling fullscreen.
    add_window_movement_listeneres()
    {
        // Firefox doesn't send any mouse events at all when the window moves (not even focus
        // changes), which makes this look weird since it doesn't update until the mouse moves.
        // Just disable it on Firefox.
        if(navigator.userAgent.indexOf("Firefox/") != -1)
            return;

        if(this.remove_window_movement_listeners != null)
            return;

        this.last_offset = null;
        let controller = new AbortController();
        let signal = controller.signal;

        signal.addEventListener("abort", () => {
            this.remove_window_movement_listeners = null;
        });

        // Call this.remove_window_movement_listeners() to turn this back off.
        this.remove_window_movement_listeners = controller.abort.bind(controller);

        // Listen for hover events too.  We don't get mousemouve events if the window changes
        // but the mouse doesn't move, but the hover usually does change.
        for(let event of ["mouseenter", "mouseleave", "mousemove", "mouseover", "mouseout"])
        {
            window.addEventListener(event, this.mouse_position_changed, { capture: true, signal });
        }
    }

    mouse_position_changed = (e) => {
        if(!this.visible)
            throw new Error("Expected to be visible");

        // The position of the client area onscreen.  If we have client scaling, this is
        // in client units.
        let windowX = e.screenX/window.devicePixelRatio - e.clientX;
        let windowY = e.screenY/window.devicePixelRatio - e.clientY;

        // Stop if it hasn't changed.  screenX/devicePixelRatio can be fractional and not match up
        // with clientX exactly, so ignore small changes.
        if(this.last_offset != null &&
            Math.abs(windowX - this.last_offset.x) <= 1 &&
            Math.abs(windowY - this.last_offset.y) <= 1)
            return;

        let previous = this.last_offset;
        this.last_offset = { x: windowX, y: windowY };
        if(previous == null)
            return;

        // If the window has moved by 20x10, move the context menu by -20x-10.
        let windowDeltaX = windowX - previous.x;
        let windowDeltaY = windowY - previous.y;
        console.log(windowDeltaX, windowDeltaY);

        this.popup_position.x -= windowDeltaX;
        this.popup_position.y -= windowDeltaY;
        this.set_current_position();
    };
    
    // If element is within a button that has a tooltip set, show it.
    show_tooltip_for_element(element)
    {
        if(element != null)
            element = element.closest("[data-popup]");
        
        if(this.tooltip_element == element)
            return;

        this.tooltip_element = element;
        this.refresh_tooltip();

        if(this.tooltip_observer)
        {
            this.tooltip_observer.disconnect();
            this.tooltip_observer = null;
        }

        if(this.tooltip_element == null)
            return;

        // Refresh the tooltip if the popup attribute changes while it's visible.
        this.tooltip_observer = new MutationObserver((mutations) => {
            for(var mutation of mutations) {
                if(mutation.type == "attributes")
                {
                    if(mutation.attributeName == "data-popup")
                        this.refresh_tooltip();
                }
            }
        });
        
        this.tooltip_observer.observe(this.tooltip_element, { attributes: true });
    }

    refresh_tooltip()
    {
        var element = this.tooltip_element;
        if(element != null)
            element = element.closest("[data-popup]");
        this.container.querySelector(".tooltip-display").hidden = element == null;
        if(element != null)
            this.container.querySelector(".tooltip-display-text").dataset.popup = element.dataset.popup;
    }

    onmouseover = (e) =>
    {
        this.show_tooltip_for_element(e.target);
    }

    onmouseout = (e) =>
    {
        this.show_tooltip_for_element(e.relatedTarget);
    }

    get hide_temporarily()
    {
        return this.hidden_temporarily;
    }

    set hide_temporarily(value)
    {
        this.hidden_temporarily = value;
        this.apply_visibility();
    }

    // True if the widget is active (eg. RMB is pressed) and we're not hidden
    // by a zoom.
    get actually_visible()
    {
        return this.visible && !this.hidden_temporarily;
    }

    visibility_changed()
    {
        super.visibility_changed();
        this.apply_visibility();
        OpenWidgets.singleton.set(this, this.visible);
    }

    apply_visibility()
    {
        let visible = this.actually_visible;
        helpers.set_class(this.container, "hidden-widget", !visible);
        helpers.set_class(this.container, "visible", visible);
    }

    hide()
    {
        // For debugging, this can be set to temporarily force the context menu to stay open.
        if(window.keep_context_menu_open)
            return;

        this._clicked_media_id = null;
        this._cached_user_id = null;

        // Don't refresh yet, so we try to not change the display while it fades out.
        // We'll do the refresh the next time we're displayed.
        // this.refresh();

        if(!this.visible)
            return;

        this.visible = false;
        this.hidden_temporarily = false;
        this.apply_visibility();

        this.displayed_menu = null;
        HideMouseCursorOnIdle.enable_all("context-menu");
        this.buttons_down = {};
        ClassFlags.get.set("hide-ui", false);
        window.removeEventListener("blur", this.window_onblur);
        window.removeEventListener("dragstart", this.cancel_event, true);

        if(this.clickOutsideListener)
        {
            this.clickOutsideListener.shutdown();
            this.clickOutsideListener = null;
        }

        if(this.remove_window_movement_listeners)
            this.remove_window_movement_listeners();
    }

    cancel_event = (e) =>
    {
        e.preventDefault();
        e.stopPropagation();
    }

    // Override ctrl-clicks inside the context menu.
    //
    // This is a bit annoying.  Ctrl-clicking a link opens it in a tab, but we allow opening the
    // context menu by holding ctrl, which means all clicks are ctrl-clicks if you use the popup
    // that way.  We work around this by preventing ctrl-click from opening links in a tab and just
    // navigate normally.  This is annoying since some people might like opening tabs that way, but
    // there's no other obvious solution other than changing the popup menu hotkey.  That's not a
    // great solution since it needs to be on Ctrl or Alt, and Alt causes other problems, like showing
    // the popup menu every time you press alt-left.
    //
    // This only affects links inside the context menu, which is currently only the author link, and
    // most people probably use middle-click anyway, so this will have to do.
    handle_link_click = (e) =>
    {
        // Do nothing if opening the popup while holding ctrl is disabled.
        if(!ppixiv.settings.get("ctrl_opens_popup"))
            return;

        let a = e.target.closest("A");
        if(a == null)
            return;

        // If a previous event handler called preventDefault on this click, ignore it.
        if(e.defaultPrevented)
            return;

        // Only change ctrl-clicks.
        if(e.altKey || e.shiftKey || !e.ctrlKey)
            return;

        e.preventDefault();
        e.stopPropagation();

        let url = new URL(a.href, ppixiv.plocation);
        helpers.navigate(url);
    }

    visibility_changed(value)
    {
        super.visibility_changed(value);

        if(this.visible)
            window.addEventListener("wheel", this.onwheel, {
                capture: true,

                // Work around Chrome intentionally breaking event listeners.  Remember when browsers
                // actually made an effort to not break things?
                passive: false,
            });
        else
            window.removeEventListener("wheel", this.onwheel, true);
    }

    // Return the media ID active in the context menu, or null if none.
    //
    // If we're opened by right clicking on an illust, we'll show that image's
    // info.  Otherwise, we'll show the info for the illust we're on, if any.
    get effective_media_id()
    {
        let media_id = this._clicked_media_id ?? this._media_id;
        if(media_id == null)
            return null;

        // Don't return users this way.  They'll be returned by effective_user_id.
        let { type } = helpers.parse_media_id(media_id);
        if(type == "user")
            return null;

        return media_id;
    }

    get effective_user_id()
    {
        let media_id = this._clicked_media_id ?? this._media_id;
        if(media_id == null)
            return null;

        // If the media ID is a user, use it.
        let { type, id } = helpers.parse_media_id(media_id);
        if(type == "user")
            return id;

        // See if _load_user_id has loaded the user ID.
        if(this._cached_user_id)
            return this._cached_user_id;

        return null;
    }

    set cached_user_id(user_id)
    {
        if(this._cached_user_id == user_id)
            return;

        this._cached_user_id = user_id;
        this.refresh();
    }

    // If our media ID is an illust, load its info to get the user ID.
    async _load_user_id()
    {
        let media_id = this.effective_media_id;
        if(!this.visible)
        {
            this.cached_user_id = null;
            return;
        }

        let user_id = await ppixiv.user_cache.get_user_id_for_media_id(media_id);

        // Stop if the media ID changed.
        if(media_id != this.effective_media_id)
            return;

        this.cached_user_id = user_id;
    }

    set_media_id(media_id)
    {
        if(this._media_id == media_id)
            return;

        this._media_id = media_id;
        this.refresh();
    }

    // Put the zoom toggle button under the cursor, so right-left click is a quick way
    // to toggle zoom lock.
    get elementToCenter()
    {
        return this.displayed_menu.querySelector(".button-zoom");
    }
        
    get _is_zoom_ui_enabled()
    {
        return this._current_viewer != null && this._current_viewer.slideshowMode == null;
    }

    set_data_source(data_source)
    {
        if(this.data_source == data_source)
            return;

        this.data_source = data_source;

        for(let widget of this.illust_widgets)
        {
            if(widget.set_data_source)
                widget.set_data_source(data_source);
        }

        this.refresh();
    }

    // Handle key events.  This is called whether the context menu is open or closed, and handles
    // global hotkeys.  This is handled here because it has a lot of overlapping functionality with
    // the context menu.
    //
    // The actual actions may happen async, but this always returns synchronously since the keydown/keyup
    // event needs to be defaultPrevented synchronously.
    //
    // We always return true for handled hotkeys even if we aren't able to perform them currently, so
    // keys don't randomly revert to default actions.
    _handle_key_event_for_image(e)
    {
        // These hotkeys require an image, which we have if we're viewing an image or if the user
        // was hovering over an image in search results.  We might not have the illust info yet,
        // but we at least need an illust ID.
        let mediaId = this.effective_media_id;

        // If there's no effective media ID, the user is pressing a key while the context menu isn't
        // open.  If the cursor is over a search thumbnail, use its media ID if any, to allow hovering
        // over a thumbnail and using bookmark, etc. hotkeys.  This isn't needed when ctrl_opens_popup
        // is open since we'll already have effective_idmedia_id.
        if(mediaId == null)
        {
            let node = this._get_hovered_element();
            mediaId = ppixiv.app.get_illust_at_element(node).mediaId;
        }

        // All of these hotkeys require Ctrl.
        if(!e.ctrlKey)
            return;

        if(e.key.toUpperCase() == "V")
        {
            (async() => {
                if(mediaId == null)
                    return;

                Actions.like_image(mediaId);
            })();

            return true;
        }

        if(e.key.toUpperCase() == "B")
        {
            (async() => {
                if(mediaId == null)
                    return;

                let illust_data = ppixiv.media_cache.get_media_info(mediaId, { full: false });

                // Ctrl-Shift-Alt-B: add a bookmark tag
                if(e.altKey && e.shiftKey)
                {
                    Actions.add_new_tag(mediaId);
                    return;
                }

                // Ctrl-Shift-B: unbookmark
                if(e.shiftKey)
                {
                    if(illust_data.bookmarkData == null)
                    {
                        ppixiv.message.show("Image isn't bookmarked");
                        return;
                    }

                    Actions.bookmark_remove(mediaId);
                    return;
                }

                // Ctrl-B: bookmark with default privacy
                // Ctrl-Alt-B: bookmark privately
                let bookmark_privately = null;
                if(e.altKey)
                    bookmark_privately = true;

                if(illust_data.bookmarkData != null)
                {
                    ppixiv.message.show("Already bookmarked (^B to remove bookmark)");
                    return;
                }

                Actions.bookmark_add(mediaId, {
                    private: bookmark_privately
                });
            })();
            
            return true;
        }

        if(e.key.toUpperCase() == "P")
        {
            let enable = !ppixiv.settings.get("auto_pan", false);
            ppixiv.settings.set("auto_pan", enable);

            ppixiv.message.show(`Image panning ${enable? "enabled":"disabled"}`);
            return true;
        }

        if(e.key.toUpperCase() == "S")
        {
            // Go async to get media info if it's not already available.
            (async() => {
                if(mediaId == null)
                    return;

                // Download the image or video by default.  If alt is pressed and the image has
                // multiple pages, download a ZIP instead.
                let media_info = await ppixiv.media_cache.get_media_info(mediaId, { full: false });
                let download_type = "image";
                if(Actions.is_download_type_available("image", media_info))
                    download_type = "image";
                else if(Actions.is_download_type_available("MKV", media_info))
                    download_type = "MKV";

                if(e.altKey && Actions.is_download_type_available("ZIP", media_info))
                    download_type = "ZIP";
    
                Actions.download_illust(mediaId, download_type);
            })();

            return true;
        }

        return false;
    }

    _handle_key_event_for_user(e)
    {
        // These hotkeys require a user, which we have if we're viewing an image, if the user
        // was hovering over an image in search results, or if we're viewing a user's posts.
        // We might not have the user info yet, but we at least need a user ID.
        let user_id = this.effective_user_id;

        // All of these hotkeys require Ctrl.
        if(!e.ctrlKey)
            return;

        if(e.key.toUpperCase() == "F")
        {
            (async() => {
                if(user_id == null)
                    return;

                var user_info = await ppixiv.user_cache.get_user_info_full(user_id);
                if(user_info == null)
                    return;

                // Ctrl-Shift-F: unfollow
                if(e.shiftKey)
                {
                    if(!user_info.isFollowed)
                    {
                        ppixiv.message.show("Not following this user");
                        return;
                    }

                    await Actions.unfollow(user_id);
                    return;
                }
            
                // Ctrl-F: follow with default privacy
                // Ctrl-Alt-F: follow privately
                //
                // It would be better to check if we're following publically or privately to match the hotkey, but
                // Pixiv doesn't include that information.
                let follow_privately = null;
                if(e.altKey)
                    follow_privately = true;

                if(user_info.isFollowed)
                {
                    ppixiv.message.show("Already following this user");
                    return;
                }
            
                await Actions.follow(user_id, follow_privately);
            })();

            return true;
        }

        return false;
    }

    handle_key_event(e)
    {
        if(e.type != "keydown")
            return false;

        if(e.altKey && e.key == "Enter")
        {
            helpers.toggle_fullscreen();
            return true;
        }

        if(this._is_zoom_ui_enabled)
        {
            // Ctrl-0 toggles zoom, similar to the browser Ctrl-0 reset zoom hotkey.
            if(e.code == "Digit0" && e.ctrlKey)
            {
                e.preventDefault();
                e.stopImmediatePropagation();
                this._current_viewer.zoom_toggle({reset_position: true});
                return;
            }

            var zoom = helpers.is_zoom_hotkey(e);
            if(zoom != null)
            {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.handle_zoom_event(e, zoom < 0);
                return true;
            }
        }

        // Check image and user hotkeys.
        if(this._handle_key_event_for_image(e))
            return true;

        if(this._handle_key_event_for_user(e))
            return true;
        
        return false;
    }

    onwheel = (e) =>
    {
        // RMB-wheel zooming is confusing in toggle mode.
        if(this.toggle_mode)
            return;

        // Stop if zooming isn't enabled.
        if(!this._is_zoom_ui_enabled)
            return;

        // Only mousewheel zoom if the popup menu is visible.
        if(!this.visible)
            return;

        // We want to override almost all mousewheel events while the popup menu is open, but
        // don't override scrolling the popup menu's tag list.
        if(e.target.closest(".popup-bookmark-tag-dropdown"))
            return;

        e.preventDefault();
        e.stopImmediatePropagation();
        
        var down = e.deltaY > 0;
        this.handle_zoom_event(e, down);
    }
    
    // Handle both mousewheel and control-+/- zooming.
    handle_zoom_event(e, down)
    {
        e.preventDefault();
        e.stopImmediatePropagation();

        if(!this.hide_temporarily)
        {
            // Hide the popup menu.  It remains open, so hide() will still be called when
            // the right mouse button is released and the overall flow remains unchanged, but
            // the popup itself will be hidden.
            this.hide_temporarily = true;
        }

        // If e is a keyboard event, use null to use the center of the screen.
        var keyboard = e instanceof KeyboardEvent;
        let x = keyboard? null:e.clientX;
        let y = keyboard? null:e.clientY;

        this._current_viewer.zoom_adjust(down, {x, y});
        
        this.refresh();
    }

    // Set an alternative illust ID to show.  This is effective until the context menu is hidden.
    // This is used to remember what the cursor was over when the context menu was opened when in
    // the search view.
    _set_temporary_illust(media_id)
    {
        if(this._clicked_media_id == media_id)
            return;

        this._clicked_media_id = media_id;
        this._cached_user_id = null;

        this.refresh();
    }

    // Update selection highlight for the context menu.
    refresh()
    {
        // If we're not visible, don't refresh an illust until we are, so we don't trigger
        // data loads.  Do refresh even if we're hidden if we have no illust to clear
        // the previous illust's display even if we're not visible, so it's not visible the
        // next time we're displayed.
        let media_id = this.effective_media_id;
        if(!this.visible && media_id != null)
            return;

        // If we haven't loaded the user ID yet, start it now.  This is async and we won't wait
        // for it here.  It'll call refresh() again when it finishes.
        this._load_user_id();
            
        let user_id = this.effective_user_id;
        let info = media_id? ppixiv.media_cache.get_media_info_sync(media_id, { full: false }):null;

        this.button_view_manga.dataset.popup = "View manga pages";
        helpers.set_class(this.button_view_manga, "enabled", info?.pageCount > 1);
        helpers.set_class(this.button_fullscreen, "selected", helpers.is_fullscreen());

        this.refresh_tooltip();

        // Enable the zoom buttons if we're in the image view and we have an on_click_viewer.
        for(var element of this.container.querySelectorAll(".button.requires-zoom"))
            helpers.set_class(element, "enabled", this._is_zoom_ui_enabled);

        // If we're visible, tell widgets what we're viewing.  Don't do this if we're not visible, so
        // they don't load data unnecessarily.  Don't set these back to null if we're hidden, so they
        // don't blank themselves while we're still fading out.
        if(this.visible)
        {
            for(let widget of this.illust_widgets)
            {
                if(widget.setMediaId)
                    widget.setMediaId(media_id);
                if(widget.setUserId)
                    widget.setUserId(user_id);
                // XXX remove
                if(widget.set_media_id)
                    widget.set_media_id(media_id);
                if(widget.set_user_id)
                    widget.set_user_id(user_id);

                // If _clicked_media_id is set, we're open for a search result image the user right-clicked
                // on.  Otherwise, we're open for the image actually being viewed.  Tell ImageInfoWidget
                // to show the current manga page if we're on a viewed image, but not if we're on a search
                // result.
                let showing_viewed_image = (this._clicked_media_id == null);
                widget.show_page_number = showing_viewed_image;
            }

            // If we're on a local ID, show the parent folder button.  Otherwise, show the
            // author button.  We only show one or the other of these.
            //
            // If we don't have an illust ID, see if the data source has a folder ID, so this
            // works when right-clicking outside thumbs on search pages.
            let folder_button = this.container.querySelector(".button-parent-folder");
            let author_button = this.container.querySelector(".avatar-widget-container");

            let is_local = helpers.is_media_id_local(this.folder_id_for_parent);
            folder_button.hidden = !is_local;
            author_button.hidden = is_local;
            helpers.set_class(folder_button, "enabled", this.parent_folder_id != null);
        }

        if(this._is_zoom_ui_enabled)
        {
            helpers.set_class(this.container.querySelector(".button-zoom"), "selected", this._current_viewer.getLockedZoom());

            let zoom_level = this._current_viewer.get_zoom_level();
            for(let button of this.container.querySelectorAll(".button-zoom-level"))
                helpers.set_class(button, "selected", this._current_viewer.getLockedZoom() && button.dataset.level == zoom_level);
        }
    }

    clicked_view_manga = (e) =>
    {
        if(!this.button_view_manga.classList.contains("enabled"))
            return;

        let args = getUrlForMediaId(this.effective_media_id, { manga: true });
        helpers.navigate(args);
    }

    clicked_fullscreen = async (e) =>
    {
        e.preventDefault();
        e.stopPropagation();

        await helpers.toggle_fullscreen();
        this.refresh();
    }

    // "Zoom lock", zoom as if we're holding the button constantly
    clicked_zoom_toggle = (e) =>
    {
        e.preventDefault();
        e.stopPropagation();

        if(!this._is_zoom_ui_enabled)
            return;
        
        this._current_viewer.zoom_toggle({x: e.clientX, y: e.clientY})
        this.refresh();
    }

    clicked_zoom_level = (e) =>
    {
        e.preventDefault();
        e.stopPropagation();

        if(!this._is_zoom_ui_enabled)
            return;

        this._current_viewer.zoom_set_level(e.currentTarget.dataset.level, {x: e.clientX, y: e.clientY});
        this.refresh();
    }

    // Return the illust ID whose parent the parent button will go to.
    get folder_id_for_parent()
    {
        return this.effective_media_id || this.data_source.viewing_folder;
    }

    // Return the folder ID that the parent button goes to.
    get parent_folder_id()
    {
        let folder_id = this.folder_id_for_parent;
        let is_local = helpers.is_media_id_local(folder_id);
        if(!is_local)
            return null;

        // Go to the parent of the item that was clicked on. 
        let parent_folder_id = LocalAPI.get_parent_folder(folder_id);

        // If the user right-clicked a thumbnail and its parent is the folder we're
        // already displaying, go to the parent of the folder instead (otherwise we're
        // linking to the page we're already on).  This makes the parent button make
        // sense whether you're clicking on an image in a search result (go to the
        // location of the image), while viewing an image (also go to the location of
        // the image), or in a folder view (go to the folder's parent).
        let currently_displaying_id = LocalAPI.get_local_id_from_args(helpers.args.location);
        if(parent_folder_id == currently_displaying_id)
            parent_folder_id = LocalAPI.get_parent_folder(parent_folder_id);

        return parent_folder_id;
    }

    clicked_go_to_parent = (e) =>
    {
        e.preventDefault();
            
        let parent_folder_id = this.parent_folder_id;
        if(parent_folder_id == null)
            return;

        let args = new helpers.args("/", ppixiv.plocation);
        LocalAPI.get_args_for_id(parent_folder_id, args);
        helpers.navigate(args.url);
    }
}

class ImageInfoWidget extends IllustWidget
{
    constructor({
        show_title=false,
        ...options})
    {
        super({ ...options, template: `
            <div class=context-menu-image-info>
                <div class=title-text-block>
                    <span class=folder-block hidden>
                        <span class=folder-text></span>
                        <span class=slash">/</span>
                    </span>
                    <span class=title hidden></span>
                </div>
                <div class=page-count hidden></div>
                <div class=image-info hidden></div>
                <div class="post-age popup" hidden></div>
            </div>
        `});

        this.show_title = show_title;
    }

    get needed_data()
    {
        // We need illust info if we're viewing a manga page beyond page 1, since
        // early info doesn't have that.  Most of the time, we only need early info.
        if(this._page == null || this._page == 0)
            return "partial";
        else
            return "full";
    }

    set show_page_number(value)
    {
        this._show_page_number = value;
        this.refresh();
    }

    refresh_internal({ media_id, media_info })
    {
        this.container.hidden = media_info == null;
        if(this.container.hidden)
            return;

        var set_info = (query, text) =>
        {
            var node = this.container.querySelector(query);
            node.innerText = text;
            node.hidden = text == "";
        };
        
        // Add the page count for manga.  If the data source is data_source.vview, show
        // the index of the current file if it's loaded all results.
        let current_page = this._page;
        let page_count = media_info.pageCount;
        let show_page_number = this._show_page_number;
        if(this.data_source?.name == "vview" && this.data_source.all_pages_loaded)
        {
            let { page } = this.data_source.id_list.getPageForMediaId(media_id);
            let ids = this.data_source.id_list.mediaIdsByPage.get(page);
            if(ids != null)
            {
                current_page = ids.indexOf(media_id);
                page_count = ids.length;
                show_page_number = true;
            }
        }

        let page_text = "";
        if(page_count > 1)
        {
            if(show_page_number || current_page > 0)
                page_text = `Page ${current_page+1}/${page_count}`;
            else
                page_text = `${page_count} pages`;
        }
        set_info(".page-count", page_text);

        if(this.show_title)
        {
            set_info(".title", media_info.illustTitle);
        
            let show_folder = helpers.is_media_id_local(this._media_id);
            this.container.querySelector(".folder-block").hidden = !show_folder;
            if(show_folder)
            {
                let {id} = helpers.parse_media_id(this._media_id);
                this.container.querySelector(".folder-text").innerText = helpers.get_path_suffix(id, 1, 1); // parent directory
            }
        }

        // If we're on the first page then we only requested early info, and we can use the dimensions
        // on it.  Otherwise, get dimensions from mangaPages from illust data.  If we're displaying a
        // manga post and we don't have illust data yet, we don't have dimensions, so hide it until
        // it's loaded.
        var info = "";
        let { width, height } = ppixiv.media_cache.get_dimensions(media_info, this._media_id);
        if(width != null && height != null)
            info += width + "x" + height;
        set_info(".image-info", info);

        let seconds_old = (new Date() - new Date(media_info.createDate)) / 1000;
        let age = helpers.age_to_string(seconds_old);
        this.container.querySelector(".post-age").dataset.popup = helpers.date_to_string(media_info.createDate);
        set_info(".post-age", age);
    }

    set_data_source(data_source)
    {
        if(this.data_source == data_source)
            return;

        this.data_source = data_source;
        this.refresh();
    }
}