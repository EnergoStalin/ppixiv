"use strict";

// The main UI.  This handles creating the viewers and the global UI.
ppixiv.view_illust = class extends ppixiv.view
{
    constructor(container)
    {
        super(container);
        
        this.onwheel = this.onwheel.bind(this);
        this.refresh_ui = this.refresh_ui.bind(this);
        this.data_source_updated = this.data_source_updated.bind(this);

        this.current_illust_id = -1;
        this.latest_navigation_direction_down = true;
        this.container = container;

        this.progress_bar = main_controller.singleton.progress_bar;

        // Create a UI box and put it in its container.
        var ui_container = this.container.querySelector(".ui");
        this.ui = new image_ui(ui_container, this.progress_bar);
        
        var ui_box = this.container.querySelector(".ui-box");

        var ui_visibility_changed = () => {
            // Hide the dropdown tag widget when the hover UI is hidden.
            if(!ui_box.classList.contains("hovering-over-box") && !ui_box.classList.contains("hovering-over-sphere"))
            {
                this.ui.bookmark_tag_widget.visible = false; // XXX remove
                view_hidden_listener.send_viewhidden(ui_box);
            }
        };
        ui_box.addEventListener("mouseenter", (e) => { helpers.set_class(ui_box, "hovering-over-box", true); ui_visibility_changed(); });
        ui_box.addEventListener("mouseleave", (e) => { helpers.set_class(ui_box, "hovering-over-box", false); ui_visibility_changed(); });

        var hover_circle = this.container.querySelector(".ui .hover-circle");
        hover_circle.addEventListener("mouseenter", (e) => { helpers.set_class(ui_box, "hovering-over-sphere", true); ui_visibility_changed(); });
        hover_circle.addEventListener("mouseleave", (e) => { helpers.set_class(ui_box, "hovering-over-sphere", false); ui_visibility_changed(); });

        image_data.singleton().user_modified_callbacks.register(this.refresh_ui);
        image_data.singleton().illust_modified_callbacks.register(this.refresh_ui);
        settings.register_change_callback("recent-bookmark-tags", this.refresh_ui);

        // Remove the "flash" class when the page change indicator's animation finishes.
        let page_change_indicator = this.container.querySelector(".page-change-indicator");
        page_change_indicator.addEventListener("animationend", (e) => {
            console.log("done", e.target);
            page_change_indicator.classList.remove("flash");
        });

        new hide_mouse_cursor_on_idle(this.container.querySelector(".mouse-hidden-box"));

        // this.manga_thumbnails = new manga_thumbnail_widget(this.container.querySelector(".manga-thumbnail-container"));

        this.container.addEventListener("wheel", this.onwheel, { passive: false });

        // A bar showing how far along in an image sequence we are:
        this.manga_page_bar = new progress_bar(this.container.querySelector(".ui-box")).controller();
        this.seek_bar = new seek_bar(this.container.querySelector(".ugoira-seek-bar"));

        this.set_active(false, null);
        this.flashed_page_change = false;
    }

    set_data_source(data_source)
    {
        if(data_source == this.data_source)
            return;

        if(this.data_source != null)
        {
            this.data_source.remove_update_listener(this.data_source_updated);
            this.data_source = null;
        }

        this.data_source = data_source;
        this.ui.data_source = data_source;

        if(this.data_source != null)
        {
            this.data_source.add_update_listener(this.data_source_updated);

            this.refresh_ui();
        }
    }

    get _hide_image()
    {
        return this.container.querySelector(".image-container").hidden;
    }
    set _hide_image(value)
    {
        this.container.querySelector(".image-container").hidden = value;
    }
    
    // Show an image.
    // If manga_page is -1, show the last page.
    async show_image(illust_id, manga_page)
    {
        helpers.set_class(document.body,  "force-ui", unsafeWindow.debug_show_ui);

        // Reset the manga page change indicator when we change images.
        this.flashed_page_change = false;

        // If we previously set a pending navigation, this navigation overrides it.
        this.cancel_async_navigation();

        // Remember that this is the image we want to be displaying.
        this.wanted_illust_id = illust_id;
        this.wanted_illust_page = manga_page;

        // If this image is already loaded, just make sure it's not hidden.
        if(illust_id == this.current_illust_id && this.viewer != null && this.wanted_illust_page == this.viewer.page && !this._hide_image)
        {
            console.log("illust_id", illust_id, "page", this.wanted_illust_page, "already displayed");
            return;
        }

        // If we're not active, stop.  We'll show this image if we become loaded later.
        if(!this.active)
        {
            // console.log("not active, set wanted id to", this.wanted_illust_id);
            return;
        }

        // Tell the preloader about the current image.
        image_preloader.singleton.set_current_image(illust_id);

        var image_container = this.container.querySelector(".image-container");

        // If possible, show the quick preview.
        this.show_fast_preview(illust_id, manga_page);

        // Load info for this image if needed.
        var illust_data = await image_data.singleton().get_image_info(illust_id);

        // If we were deactivated while waiting for image info or the image we want to show has changed, stop.
        if(!this.active || this.wanted_illust_id != illust_id)
        {
            console.log("show_image: illust ID changed while async, stopping");
            return;
        }

        // Remove the preview image, if any, since we're starting up the real viewer.  Note
        // that viewer_illust will create an identical-looking preview once it starts.
        this.hide_preview();

        // If manga_page is -1, we didn't know the page count when we did the navigation
        // and we want the last page.  Otherwise, just make sure the page is in range.
        if(manga_page == -1)
            manga_page = illust_data.pageCount - 1;
        else
            manga_page = helpers.clamp(manga_page, 0, illust_data.pageCount-1);

        console.log("Showing image", illust_id, "page", manga_page);

        // If we adjusted the page, update the URL.  Allow "page" to be 1 or not present for
        // page 1.
        var args = helpers.get_args(ppixiv.location);
        var wanted_page_arg = illust_data.pageCount > 1? (manga_page + 1).toString():1;
        let current_page_arg = args.hash.get("page") || "1";
        if(current_page_arg != wanted_page_arg)
        {
            if(wanted_page_arg != null)
                args.hash.set("page", wanted_page_arg);
            else
                args.hash.delete("page");

            console.log("Updating URL with page number:", args.hash.toString());
            helpers.set_args(args, false /* add_to_history */);
        }

        // This is the first image we're displaying if we previously had no illust ID, or
        // if we were hidden.
        var first_image_displayed = this.current_illust_id == -1 || this._hide_image;

        // If the illust ID isn't changing, just update the viewed page.
        if(illust_id == this.current_illust_id && this.viewer != null)
        {
            console.log("Image ID not changed, setting page", this.wanted_illust_page, "of image", this.current_illust_id);
            this._hide_image = false;
            this.viewer.page = this.wanted_illust_page;
            if(this.manga_thumbnails)
                this.manga_thumbnails.current_page_changed(manga_page);
            this.refresh_ui();

            return;
        }

        // Speculatively load the next image, which is what we'll show if you press page down, so
        // advancing through images is smoother.
        //
        // We don't do this when showing the first image, since the most common case is simply
        // viewing a single image and not navigating to any others, so this avoids making
        // speculative loads every time you load a single illustration.
        if(!first_image_displayed)
        {
            // Let image_preloader handle speculative loading.  If preload_illust_id is null,
            // we're telling it that we don't need to load anything.
            var preload_illust_id = this.data_source.id_list.get_neighboring_illust_id(illust_id, this.latest_navigation_direction_down);
            image_preloader.singleton.set_speculative_image(preload_illust_id);
        }

        this.current_illust_id = illust_id;
        this.current_illust_data = illust_data;

        this.ui.illust_id = illust_id;

        this.refresh_ui();

        var illust_data = this.current_illust_data;
        
        // If the image has the ドット絵 tag, enable nearest neighbor filtering.
        helpers.set_class(document.body, "dot", helpers.tags_contain_dot(illust_data));

        // Dismiss any message when changing images.
        message_widget.singleton.hide();
       
        // If we're showing something else, remove it.
        if(this.viewer != null)
        {
            this.viewer.shutdown();
            this.viewer = null;
        }

        // The viewer is gone, so we can unhide the image container without flashing the
        // previous image.
        this._hide_image = false;

        // Check if this image is muted.
        var muted_tag = muting.singleton.any_tag_muted(illust_data.tags.tags);
        var muted_user = muting.singleton.is_muted_user_id(illust_data.userId);

        if(muted_tag || muted_user)
        {
            // Tell the thumbnail view about the image.  If the image is muted, disable thumbs.
            if(this.manga_thumbnails)
                this.manga_thumbnails.set_illust_info(null);

            // If the image is muted, load a dummy viewer.
            this.viewer = new viewer_muted(image_container, illust_data);
            return;
        }
     
        var manga_page = this.wanted_illust_page;
        if(manga_page == -1)
            manga_page = illust_data.pageCount - 1;

        // Tell the thumbnail view about the image.
        if(this.manga_thumbnails)
        {
            this.manga_thumbnails.set_illust_info(illust_data);
            this.manga_thumbnails.snap_transition();

            // Let the manga thumbnail display know about the selected page.
            this.manga_thumbnails.current_page_changed(manga_page);
        }

        // Create the image viewer.
        var progress_bar = this.progress_bar.controller();
        if(illust_data.illustType == 2)
            this.viewer = new viewer_ugoira(image_container, illust_data, this.seek_bar, {
                progress_bar: progress_bar,
            });
        else
        {
            this.viewer = new viewer_images(image_container, illust_data, {
                progress_bar: progress_bar,
                manga_page_bar: this.manga_page_bar,
                manga_page: manga_page,
            });
        }

        this.viewer.active = this._active;

        // Refresh the UI now that we have a new viewer.
        this.refresh_ui();
    }

    // If we started navigating to a new image and were delayed to load data (either to load
    // the image or to load a new page), cancel it and stay where we are.
    cancel_async_navigation()
    {
        // If we previously set a pending navigation, this navigation overrides it.
        if(this.pending_navigation == null)
            return;

        console.info("Cancelling async navigation");
        this.pending_navigation = null;
    }

    // When loading an image, illust_viewer shows the search thumbnail while loading the main
    // image.  However, we can only start illust_viewer once we have image info, which causes
    // UI delays, even though we often already have enough info to show the preview image
    // immediately.
    //
    // If we have thumbnail data for illust_id, create a dummy image viewer to show it until
    // we start the main viewer.  The image is already cached if we're coming from a search
    // result, so this is often shown immediately.
    //
    // If this shows a preview image, the viewer will be removed.
    show_fast_preview(illust_id, manga_page)
    {
        this.hide_preview();

        // See if we already have thumbnail data loaded.
        var illust_thumbnail_data = thumbnail_data.singleton().get_one_thumbnail_info(illust_id);
        if(illust_thumbnail_data == null)
            return;

        // Don't do this if we're viewing a multi-page post past the first page.
        if(manga_page != 0)
            return;
            
        // Don't show the preview if this image is muted.
        var muted_tag = muting.singleton.any_tag_muted(illust_thumbnail_data.tags);
        var muted_user = muting.singleton.is_muted_user_id(illust_thumbnail_data.userId);
        if(muted_tag || muted_user)
            return;
        
        // Hack: If we were already showing a page on the same image, that means we're
        // changing manga pages within the same post.  Don't show the preview in this
        // case, so we don't remove the viewer and reset the zoom/pan position.
        if(illust_id == this.current_illust_id && this.viewer != null)
        {
            console.log("Not showing preview because we're changing manga pages");
            return;
        }

        console.log("Show fast preview for", illust_thumbnail_data.id);
        this.preview_img = document.createElement("img");
        this.preview_img.src = illust_thumbnail_data.url;
        this.preview_img.style.pointerEvents = "none";
        this.preview_img.classList.add("filtering");
        this.preview_img.classList.add("low-res-preview");
        
        var preview_container = this.container.querySelector(".preview-container");
        preview_container.appendChild(this.preview_img);
        
        this.preview_on_click_viewer = new on_click_viewer();
        this.preview_on_click_viewer.set_new_image(this.preview_img, null, illust_thumbnail_data.width, illust_thumbnail_data.height);

        // Don't actually allow zooming the preview, since it'll reset once it's replaced with the real
        // viewer.  We just create the on_click_viewer to match the zoom with what the real image will
        // have.
        this.preview_on_click_viewer.disable();

        // The preview is taking the place of the viewer until we create it, so remove any existing
        // viewer.
        if(this.viewer != null)
        {
            this.viewer.shutdown();
            this.viewer = null;
        }
    }

    // Remove our preview image.
    hide_preview()
    {
        if(this.preview_on_click_viewer != null)
        {
            this.preview_on_click_viewer.disable();
            this.preview_on_click_viewer = null;
        }

        if(this.preview_img != null)
        {
            this.preview_img.remove();
            this.preview_img = null;
        }
    }

    // Stop displaying any image (and cancel any wanted navigation), putting us back
    // to where we were before displaying any images.
    //
    // This will also prevent the next image displayed from triggering speculative
    // loading, which we don't want to do when clicking an image in the thumbnail
    // view.
    stop_displaying_image()
    {
        if(this.viewer != null)
        {
            this.viewer.shutdown();
            this.viewer = null;
        }

        if(this.manga_thumbnails)
            this.manga_thumbnails.set_illust_info(null);
        
        this.hide_preview();

        this.wanted_illust_id = null;

        // The manga page to show, or the last page if -1.
        this.wanted_illust_page = 0;
        this.current_illust_id = -1;
        this.refresh_ui();
    }

    data_source_updated()
    {
        this.refresh_ui();
    }

    get active()
    {
        return this._active;
    }

    set_active(active, data_source)
    {
        if(this._active == active)
            return;

        this._active = active;
        super.set_active(active, data_source);

        // If we have a viewer, tell it if we're active.
        if(this.viewer != null)
            this.viewer.active = this._active;

        if(!active)
        {
            this.cancel_async_navigation();

            // Remove any image we're displaying, so if we show another image later, we
            // won't show the previous image while the new one's data loads.
            if(this.viewer != null)
                this._hide_image = true;

            // Stop showing the user in the context menu, and stop showing the current page.
            main_context_menu.get.user_info = null;
            main_context_menu.get.page = -1;
            
            this.flashed_page_change = false;

            return;
        }

        this.set_data_source(data_source);

        // If show_image was called while we were inactive, load it now.
        if(this.wanted_illust_id != this.current_illust_id || this.viewer == null || this.wanted_illust_page != this.viewer.page || this._hide_image)
        {
            // Show the image.
            console.log("Showing illust_id", this.wanted_illust_id, "that was set while hidden");
            this.show_image(this.wanted_illust_id, this.wanted_illust_page);
        }
        
        // If we're becoming active, refresh the UI, since we don't do that while we're inactive.
        this.refresh_ui();
    }

    // Refresh the UI for the current image.
    refresh_ui()
    {
        // Don't refresh if the thumbnail view is active.  We're not visible, and we'll just
        // step over its page title, etc.
        if(!this._active)
            return;
        
        // Tell the UI which page is being viewed.
        var page = this.viewer != null? this.viewer.page:0;
        this.ui.set_displayed_page_info(page);

        // Tell the context menu which user is being viewed.
        main_context_menu.get.user_info = this.current_illust_data? this.current_illust_data.userInfo:null;
        main_context_menu.get.page = page;

        // Pull out info about the user and illustration.
        var illust_id = this.current_illust_id;

        // Update the disable UI button to point at the current image's illustration page.
        var disable_button = this.container.querySelector(".disable-ui-button");
        disable_button.href = "/artworks/" + illust_id + "#no-ppixiv";

        // If we're not showing an image yet, hide the UI and don't try to update it.
        helpers.set_class(this.container.querySelector(".ui"), "disabled", illust_id == -1);

        helpers.set_title_and_icon(this.current_illust_data);

        if(illust_id == -1)
            return;

        this.ui.refresh();
    }

    onwheel(e)
    {
        if(!this._active)
            return;        

        // Don't intercept wheel scrolling over the description box.
        if(e.target.closest(".description") != null)
            return;

        var down = e.deltaY > 0;
        this.move(down, e.shiftKey /* skip_manga_pages */);
    }

    get displayed_illust_id()
    {
        return this.wanted_illust_id;        
    }

    get displayed_illust_page()
    {
        return this.wanted_illust_page;
    }

    handle_onkeydown(e)
    {
        // Let the viewer handle the input first.
        if(this.viewer && this.viewer.onkeydown)
        {
            this.viewer.onkeydown(e);
            if(e.defaultPrevented)
                return;
        }

        this.ui.handle_onkeydown(e);
        if(e.defaultPrevented)
            return;
        
        if(e.ctrlKey || e.altKey || e.metaKey)
            return;

        switch(e.keyCode)
        {
        case 37: // left
        case 38: // up
        case 33: // pgup
            e.preventDefault();
            e.stopPropagation();

            this.move(false, e.shiftKey /* skip_manga_pages */);
            break;

        case 39: // right
        case 40: // down
        case 34: // pgdn
            e.preventDefault();
            e.stopPropagation();

            this.move(true, e.shiftKey /* skip_manga_pages */);
            break;
        }
    }

    // Navigate to the next or previous image.
    //
    // If skip_manga_pages is true, jump past any manga pages in the current illustration.  If
    // this is true and we're navigating backwards, we'll also jump to the first manga page
    // instead of the last.
    async move(down, skip_manga_pages)
    {
        // Remember whether we're navigating forwards or backwards, for preloading.
        this.latest_navigation_direction_down = down;

        this.cancel_async_navigation();

        // See if we should change the manga page.
        let show_leaving_manga_post = false;
        if(!skip_manga_pages && this.wanted_illust_id != null)
        {
            // Figure out the number of pages in the image.
            //
            // Normally we'd just look at current_illust_data.  However, we can be navigated while
            // we're still waiting for that to load, immediately after the user clicks a manga page
            // in search results, and we don't want to eat those inputs.  Check both thumbnail info
            // and illust info for the page count, so we can get the page count earlier.
            let num_pages = -1;
            let illust_thumbnail_data = thumbnail_data.singleton().get_one_thumbnail_info(this.wanted_illust_id);
            if(illust_thumbnail_data)
                num_pages = illust_thumbnail_data.pageCount;

            if(num_pages == -1)
            {
                let image_info = image_data.singleton().get_image_info_sync(this.wanted_illust_id);
                if(image_info != null)
                    num_pages = image_info.pageCount;
            }

            if(num_pages > 1)
            {
                var old_page = this.wanted_illust_page;
                var new_page = old_page + (down? +1:-1);
                new_page = Math.max(0, Math.min(num_pages - 1, new_page));
                if(new_page != old_page)
                {
                    main_controller.singleton.show_illust(this.wanted_illust_id, {
                        page: new_page,
                    });
                    return;
                }

                // If the page didn't change, we reached the end of the manga post.  If we haven't
                // flashed the page change indicator yet, do it now.
                if(!this.flashed_page_change)
                    show_leaving_manga_post = true;
            }
        }

        // If we have a target illust_id, move relative to it.  Otherwise, move relative to the
        // displayed image.  This way, if we navigate repeatedly before a previous navigation
        // finishes, we'll keep moving rather than waiting for each navigation to complete.
        var navigate_from_illust_id = this.wanted_illust_id;
        if(navigate_from_illust_id == null)
            navigate_from_illust_id = this.current_illust_id;

        // Get the next (or previous) illustration after the current one.  This will be null if we've
        // reached the end of the list, or if it requires loading the next page of search results.
        var new_illust_id = this.data_source.id_list.get_neighboring_illust_id(navigate_from_illust_id, down);
        if(new_illust_id == null)
        {
            // We didn't have the new illustration, so we may need to load another page of search results.
            // Find the page the current illustration is on.
            let next_page = this.data_source.id_list.get_page_for_neighboring_illust(navigate_from_illust_id, down);

            // If we can't find the next page, then the current image isn't actually loaded in
            // the current search results.  This can happen if the page is reloaded: we'll show
            // the previous image, but we won't have the results loaded (and the results may have
            // changed).  Just jump to the first image in the results so we get back to a place
            // we can navigate from.
            //
            // Note that we use id_list.get_first_id rather than get_current_illust_id, which is
            // just the image we're already on.
            if(next_page == null)
            {
                // We should normally know which page the illustration we're currently viewing is on.
                console.warn("Don't know the next page for illust", navigate_from_illust_id);
                new_illust_id = this.data_source.id_list.get_first_id();
                main_controller.singleton.show_illust(new_illust_id);
                return true;
            }

            console.log("Loading the next page of results:", next_page);

            // The page shouldn't already be loaded.  Double-check to help prevent bugs that might
            // spam the server requesting the same page over and over.
            if(this.data_source.id_list.is_page_loaded(next_page))
            {
                console.error("Page", next_page, "is already loaded");
                return;
            }

            // Ask the data source to load it.
            var pending_navigation = this.pending_navigation = new Object();
            let new_page_loaded = await this.data_source.load_page(next_page);

            // If this.pending_navigation is no longer the same as pending_navigation, we navigated since
            // we requested this load and this navigation is stale, so stop.
            if(this.pending_navigation != pending_navigation)
            {
                console.error("Aborting stale navigation");
                return;
            }

            this.pending_navigation = null;

            if(new_page_loaded)
            {
                // Now that we've loaded data, try to find the new image again.
                new_illust_id = this.data_source.id_list.get_neighboring_illust_id(navigate_from_illust_id, down);
            }

            console.log("Retrying navigation after data load");
        }

        // If we didn't get a page, we're at the end of the search results.  Flash the
        // indicator to show we've reached the end and stop.
        if(new_illust_id == null)
        {
            console.log("Reached the end of the list");
            this.flash_end_indicator(down, "last-image");
            return;
        }

        // If we're confirming leaving a manga post, do that now.  This is done after we load the
        // new page of search results if needed, so we know whether we've actually reached the end
        // and should show the end indicator above instead.
        if(show_leaving_manga_post && 0)
        {
            this.flashed_page_change = true;
            this.flash_end_indicator(down, "last-page");

            // Start preloading the next image, so we load faster if the user scrolls again to go
            // to the next image.
            if(new_illust_id != null)
                image_data.singleton().get_image_info(new_illust_id);
            return;
        }

        // Go to the new illustration if we have one.
        if(new_illust_id != null)
        {
            main_controller.singleton.show_illust(new_illust_id, {
                page: down || skip_manga_pages? 0:-1,
            });
        }
    }

    flash_end_indicator(down, icon)
    {
        let indicator = this.container.querySelector(".page-change-indicator");
        indicator.dataset.icon = icon;
        indicator.dataset.side = down? "right":"left";
        indicator.classList.remove("flash");

        // Call getAnimations() so the animation is removed immediately:
        indicator.getAnimations();

        indicator.classList.add("flash");
    }
}

