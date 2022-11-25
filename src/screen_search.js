"use strict";

function _create_main_search_menu(container)
{
    if(ppixiv.native)
        return;

    let options = [
        // This is a dummy for when we're viewing an artist on mobile.  It can't be selected directly, it's
        // only made visible when an artist is being viewed already.
        { label: "Artist",                 icon: "face",           url: "/users/1#ppixiv", visible: false, classes: ["artist-row"] },

        { label: "Search works",           icon: "search",          url: `/tags#ppixiv` },
        { label: "New works by following", icon: "photo_library",   url: "/bookmark_new_illust.php#ppixiv" },
        { label: "New works by everyone",  icon: "groups",          url: "/new_illust.php#ppixiv" },
    ];

    if(ppixiv.mobile)
    {
        // On mobile, just show a single bookmarks and follows item.
        options = [
            ...options,
            { label: "Bookmarks",          icon: "favorite",        url: `/users/${window.global_data.user_id}/bookmarks/artworks#ppixiv` },
            { label: "Followed users",     icon: "visibility",      url: `/users/${window.global_data.user_id}/following#ppixiv` },
        ];
    }
    else
    {
        options = [
            ...options,
            [
                { label: "Bookmarks",          icon: "favorite",    url: `/users/${window.global_data.user_id}/bookmarks/artworks#ppixiv` },
                { label: "all",                                     url: `/users/${window.global_data.user_id}/bookmarks/artworks#ppixiv` },
                { label: "Public",                                  url: `/users/${window.global_data.user_id}/bookmarks/artworks#ppixiv?show-all=0` },
                { label: "Private",                                 url: `/users/${window.global_data.user_id}/bookmarks/artworks?rest=hide#ppixiv?show-all=0` },
            ], [
                { label: "Followed users",     icon: "visibility",  url: `/users/${window.global_data.user_id}/following#ppixiv` },
                { label: "Public",                                  url: `/users/${window.global_data.user_id}/following#ppixiv` },
                { label: "Private",                                 url: `/users/${window.global_data.user_id}/following?rest=hide#ppixiv` },
            ]
        ];
    }

    options = [
        ...options,
    ];

    options = [
        ...options,

        { label: "Rankings",               icon: "auto_awesome"  /* who names this stuff? */, url: "/ranking.php#ppixiv" },
        { label: "Recommended works",      icon: "ppixiv:suggestions", url: "/discovery#ppixiv" },
        { label: "Recommended users",      icon: "ppixiv:suggestions", url: "/discovery/users#ppixiv" },
        { label: "Completed requests",     icon: "request_page",    url: "/request/complete/illust#ppixiv" },
        { label: "Users",                  icon: "search",          url: "/search_user.php#ppixiv" },
    ];

    let create_option = ({classes=[], ...options}) => {
        let button = new ppixiv.menu_option_button({
            container,
            classes: [...classes, "navigation-button"],
            ...options
        })

        return button;
    };

    for(let option of options)
    {
        if(Array.isArray(option))
        {
            let items = [];
            for(let suboption of option)
            {
                if(suboption == null)
                    continue;
                items.push(create_option(suboption));
            }

            new ppixiv.menu_option_row({
                container,
                items: items,
            });
        }
        else
            create_option(option);
    }
}

class thumbnail_ui_desktop extends ppixiv.widget
{
    constructor(options)
    {
        super({
            ...options,
            template: `
            <div class=thumbnail-ui-box data-context-menu-target=off>
                <!-- The images for the artist view (avatar) and related images, which shows the starting image. -->
                <div class="data-source-specific avatar-container" data-datasource="artist illust bookmarks following" data-hidden-on="mobile"></div>
                <a href=# class="data-source-specific image-for-suggestions" data-datasource=related-illusts data-hidden-on="mobile">
                    <!-- A blank image, so we don't load anything: -->
                    <img src="${helpers.blank_image}">
                </a>

                <div class=title-with-button-row-container data-hidden-on="mobile">
                    <div class=title-with-button-row>
                        <div class="displaying title-font"></div>
                        <div style="flex: 1;"></div>
                        <!-- Links at the top left when viewing a user will be inserted here. -->
                        <div class="button-row user-links">
                        </div>
                    </div>
                </div>

                <div class=button-row style="margin-bottom: 0.5em;">
                    <div class="icon-button toggle-local-navigation-button popup" data-popup="Show navigation" hidden data-hidden-on="mobile">
                        ${ helpers.create_icon("mat:keyboard_double_arrow_left") }
                    </div>

                    <a class="icon-button disable-ui-button popup pixiv-only" data-popup="Return to Pixiv" href="#no-ppixiv" data-hidden-on="mobile">
                        ${ helpers.create_icon("ppixiv:pixiv") }
                    </a>

                    <!-- These login/logout buttons are only used by the local API. -->
                    <div class="login-button icon-button popup" data-popup="Login" hidden>
                        ${ helpers.create_icon("login") }
                    </div>

                    <div class="logout-button icon-button popup" data-popup="Logout" hidden>
                        ${ helpers.create_icon("logout") }
                    </div>

                    <!-- Containing block for :hover highlights on the button: -->
                    <div class=pixiv-only>
                        <div class="icon-button popup-menu-box-button popup parent-highlight" data-popup="Search">
                            ${ helpers.create_icon("menu") }
                        </div>

                        <div hidden class="main-search-menu popup-menu-box vertical-list"></div>
                    </div>

                    <div class="refresh-search-button icon-button popup" data-popup="Refresh">
                        ${ helpers.create_icon("refresh") }
                    </div>

                    <div class="refresh-search-from-page-button icon-button popup" data-popup="Refresh from page">
                        ${ helpers.create_icon("restart_alt") }
                    </div>

                    <div class="expand-manga-posts icon-button popup">
                        ${ helpers.create_icon("") /* filled in by refresh_expand_manga_posts_button */ }
                    </div>

                    <a class="slideshow icon-button popup" data-popup="Slideshow" href="#">
                        ${ helpers.create_icon("wallpaper") }
                    </a>

                    <div class="settings-menu-box popup" data-popup="Preferences">
                        <div class="parent-highlight icon-button preferences-button">
                            ${ helpers.create_icon("settings") }
                        </div>
                        <div hidden class="popup-menu-box vertical-list">
                        </div>
                    </div>
                </div>

                <div class=data-source-ui></div>
            </div>
            `
        });

        this.container.querySelector(".refresh-search-from-page-button").addEventListener("click", this.parent.refresh_search_from_page);
        this.container.querySelector(".expand-manga-posts").addEventListener("click", (e) => {
            this.parent.search_view.toggle_expanding_media_ids_by_default();
        });

        this.container.querySelector(".refresh-search-button").addEventListener("click", () => this.parent.refresh_search());

        this.toggle_local_navigation_button = this.container.querySelector(".toggle-local-navigation-button");
        this.toggle_local_navigation_button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.parent.local_navigation_visible = !this.parent.local_navigation_visible;
            this.parent.refresh_ui();
        });        

        this.container.querySelector(".preferences-button").addEventListener("click", (e) => new ppixiv.settings_dialog());

        // Set up login/logout buttons for native.
        if(ppixiv.native)
        {
            let { logged_in, local } = local_api.local_info;
            this.container.querySelector(".login-button").hidden = local || logged_in;
            this.container.querySelector(".logout-button").hidden = local || !logged_in;
            this.container.querySelector(".login-button").addEventListener("click", () => { local_api.redirect_to_login(); });
            this.container.querySelector(".logout-button").addEventListener("click", () => {
                if(confirm("Log out?"))
                    local_api.logout();
            });
        }
    }

    refresh_ui()
    {
        let element_displaying = this.container.querySelector(".displaying");
        element_displaying.hidden = this.parent.data_source.get_displaying_text == null;
        if(this.parent.data_source.get_displaying_text != null)
        {
            let text = this.parent.data_source.get_displaying_text();
            element_displaying.replaceChildren(text);
        }

        if(this.toggle_local_navigation_button)
        {
            this.toggle_local_navigation_button.hidden = this.local_nav_widget == null || !local_search_active;
            this.toggle_local_navigation_button.querySelector(".font-icon").innerText = this.local_navigation_visible?
                "keyboard_double_arrow_left":"keyboard_double_arrow_right";
        }

        this.refresh_slideshow_button();
    }

    // Refresh the slideshow button.
    refresh_slideshow_button()
    {
        let node = this.container.querySelector("A.slideshow");
        node.href = main_controller.slideshow_url.url;
    }
}

// The bottom navigation bar for mobile, showing the current search and exposing a smaller
// action bar when open.  This vaguely follows the design language of iOS Safari.
let thumbnail_ui_mobile = class extends ppixiv.widget
{
    constructor(options)
    {
        super({
            ...options,
            template: `
            <div class=mobile-header>
                <div class=header-contents>
                    <div class=title></div>
                    <div class=button-row>
                        <div class="icon-button back-button disabled">
                            ${ helpers.create_icon("mat:arrow_back_ios_new") }
                        </div>

                        <div class="icon-button refresh-search-button">
                            ${ helpers.create_icon("refresh") }
                        </div>

                        <div class="icon-button menu">
                            ${ helpers.create_icon("search") }
                        </div>

                        <div class="icon-button slideshow">
                            ${ helpers.create_icon("wallpaper") }
                        </div>

                        <div class="icon-button preferences-button">
                            ${ helpers.create_icon("settings") }
                        </div>
                    </div>
                </div>
            </div>
        `});

        this.dragger = new ppixiv.WidgetDragger({
            node: this.container,
            close_if_outside: [this.container],
            drag_node: this.container,
            visible: false,
            direction: "up",
            animated_property: "--header-pos",
            size: 50,
            onpointerdown: ({event}) => {
                // This is very close to the bottom near system navigation, so we tap to open
                // and only drag to close, so people don't keep trying to drag to open and get
                // frustrated when it keeps activating navigation.
                return this.dragger.visible;
            },
        });

        // Show the button row when the title is clicked.
        this.container.querySelector(".title").addEventListener("click", (e) => {
            this.dragger.show();
        });

        // These need to check if the dragger is visible, since clicks are triggered when dragging the
        // bar closed when the drag is released, which causes these to activate.
        this.container.querySelector(".refresh-search-button").addEventListener("click", () => {
            if(!this.dragger.visible)
                return;

            this.parent.refresh_search();
            this.dragger.hide();
        });

        this.container.querySelector(".preferences-button").addEventListener("click", (e) => {
            if(!this.dragger.visible)
                return;

            new ppixiv.settings_dialog();
            this.dragger.hide();
        });

        this.container.querySelector(".slideshow").addEventListener("click", (e) => {
            if(!this.dragger.visible)
                return;

            helpers.navigate(main_controller.slideshow_url);
            this.dragger.hide();
        });
        
        this.container.querySelector(".menu").addEventListener("click", (e) => {
            new mobile_edit_search_dialog({
                parent: this,
            });

            this.dragger.hide();
        });

        this.container.querySelector(".back-button").addEventListener("click", () => {
            // This doesn't hide the dragger on click, in case the user wants to back out several times.
            if(ppixiv.native)
            {
                let parent_folder_id = local_api.get_parent_folder(this.parent.displayed_media_id);

                let args = helpers.args.location;
                local_api.get_args_for_id(parent_folder_id, args);
                helpers.navigate(args);
            }
            else if(ppixiv.phistory.permanent)
            {
                ppixiv.phistory.back();
            }
        });
    }

    refresh_ui()
    {
        let element_displaying = this.container.querySelector(".title");
        element_displaying.hidden = this.parent.data_source.get_displaying_text == null;
        if(this.parent.data_source.get_displaying_text != null)
        {
            let text = this.parent.data_source.get_displaying_text();
            element_displaying.replaceChildren(text);
        }

        // The back button navigate to parent locally, otherwise it's browser back if we're in
        // permanent history mode.
        let back_button = this.container.querySelector(".back-button");
        let show_back_button;
        if(ppixiv.native)
            show_back_button = local_api.get_parent_folder(this.parent.displayed_media_id) != null;
        else if(ppixiv.phistory.permanent)
            show_back_button = ppixiv.phistory.length > 1;
        helpers.set_class(back_button, "disabled", !show_back_button);
    }
}

// The search UI.
ppixiv.screen_search = class extends ppixiv.screen
{
    constructor(options)
    {
        super({...options, template: `
            <div inert class="screen screen-search-container">
                <!-- The tree widget for local navigation: -->
                <div class=local-navigation-box></div>

                <div class=search-results>
                    <div class="thumbnail-ui top-ui-box">
                        <div style="flex: 1;"></div>
                        <div class=thumbnail-ui-box-container></div>
                        <div style="flex: 1;"></div>
                    </div>

                    <div class="top-ui-box-padding"></div>

                    <div class=thumbnail-container-box></div>
                </div>

                <!-- This groups the header and search UI into a single dragger. -->
                <div class=mobile-ui-drag-container></div>

                <!-- This is controlled by the illustration view to fade the search. -->
                <div class=fade-search></div>
            </div>
        `});

        user_cache.addEventListener("usermodified", this.refresh_ui, { signal: this.shutdown_signal.signal });        

        this.thumbnail_ui = new thumbnail_ui_desktop({
            parent: this,
            container: this.container.querySelector(".thumbnail-ui-box-container"),
        });

        if(ppixiv.mobile)
        {
            this.thumbnail_ui_mobile = new thumbnail_ui_mobile({
                container: this.container.querySelector(".mobile-ui-drag-container"),
                parent: this,
            });
        }

        let option_box = this.container.querySelector(".main-search-menu");
        _create_main_search_menu(option_box);

        // Create the avatar widget shown on the artist data source.
        this.avatar_container = this.container.querySelector(".avatar-container");
        this.avatar_widget = new avatar_widget({
            container: this.avatar_container,
            big: true,
            mode: "dropdown",
        });

        // Set up hover popups.
        dropdown_menu_opener.create_handlers(this.container);
 
        settings.addEventListener("theme", this.update_from_settings, { signal: this.shutdown_signal.signal });
        settings.addEventListener("ui-on-hover", this.update_from_settings, { signal: this.shutdown_signal.signal });
        settings.addEventListener("no-hide-cursor", this.update_from_settings, { signal: this.shutdown_signal.signal });
        settings.addEventListener("no_recent_history", this.update_from_settings, { signal: this.shutdown_signal.signal });
        settings.addEventListener("expand_manga_thumbnails", this.update_from_settings, { signal: this.shutdown_signal.signal });
        muting.singleton.addEventListener("mutes-changed", this.refresh_ui_for_user_id);

        // Zoom the thumbnails on ctrl-mousewheel:
        this.container.addEventListener("wheel", (e) => {
            if(!e.ctrlKey)
                return;
    
            e.preventDefault();
            e.stopImmediatePropagation();
    
            let manga_view = this.data_source?.name == "manga";
            settings.adjust_zoom(manga_view? "manga-thumbnail-size":"thumbnail-size", e.deltaY > 0);
        }, { passive: false });

        this.container.addEventListener("keydown", (e) => {
            let zoom = helpers.is_zoom_hotkey(e);
            if(zoom != null)
            {
                e.preventDefault();
                e.stopImmediatePropagation();

                let manga_view = this.data_source?.name == "manga";
                settings.adjust_zoom(manga_view? "manga-thumbnail-size":"thumbnail-size", zoom < 0);
            }
        });

        // If the local API is enabled and tags aren't restricted, set up the directory tree sidebar.
        let local_navigation_box = this.container.querySelector(".local-navigation-box");

        if(ppixiv.local_api.is_enabled() && !local_api.local_info.bookmark_tag_searches_only)
        {
            // False if the user has hidden the navigation tree.  Default to false on mobile, since
            // it takes up a lot of screen space.  Also default to false if we were initially opened
            // as a similar image search.
            this.local_navigation_visible = !ppixiv.mobile && ppixiv.plocation.pathname != "/similar";

            this.local_nav_widget = new ppixiv.local_navigation_widget({
                parent: this,
                container: local_navigation_box,
            });
        }

        // Hack: if the local API isn't enabled, hide the local navigation box completely.  This shouldn't
        // be needed since it'll hide itself, but this prevents it from flashing onscreen and animating
        // away when the page loads.  That'll still happen if you have the local API enabled and you're on
        // a Pixiv page, but this avoids the visual glitch for most users.  I'm not sure how to fix this
        // cleanly.
        local_navigation_box.hidden = !ppixiv.local_api.is_enabled();

        /*
         * Add a slight delay before hiding the UI.  This allows opening the UI by swiping past the top
         * of the window, without it disappearing as soon as the mouse leaves the window.  This doesn't
         * affect opening the UI.
         */
        this.top_ui_box = this.container.querySelector(".top-ui-box");
        this.top_ui_box.hidden = ppixiv.mobile;
        new hover_with_delay(this.top_ui_box, 0, 0.25);

        this.search_view = new search_view({
            parent: this,
            container: this.container.querySelector(".thumbnail-container-box"),
            onstartpagechanged: () => {
                this.refresh_refresh_search_from_page();
            },
        });
        
        this.update_from_settings();
    }

    update_from_settings = () =>
    {
        document.documentElement.dataset.theme = "dark"; //settings.get("theme");
        helpers.set_class(this.top_ui_box, "ui-on-hover", settings.get("ui-on-hover") && !ppixiv.mobile);
        this.refresh_expand_manga_posts_button();

        // Flush the top UI transition, so it doesn't animate weirdly when toggling ui-on-hover.
        this.top_ui_box.classList.add("disable-transition");
        this.top_ui_box.offsetHeight;
        this.top_ui_box.classList.remove("disable-transition");
    }

    get active()
    {
        return this._active;
    }

    deactivate()
    {
        super.deactivate();
        if(!this._active)
            return;
        this._active = false;

        this.search_view.deactivate();
        main_context_menu.get.user_id = null;
    }

    async activate({ old_media_id })
    {
        console.log("Showing search, came from media ID:", old_media_id);

        super.activate();

        this._active = true;
        this.initial_refresh_ui();
        this.refresh_ui();

        await this.search_view.activate({ old_media_id });
    }

    scroll_to_media_id(media_id)
    {
        this.search_view.scroll_to_media_id(media_id);
    }

    get_rect_for_media_id(media_id)
    {
        return this.search_view.get_rect_for_media_id(media_id);
    }
    
    set_data_source(data_source)
    {
        if(this.data_source == data_source)
            return;

        // Remove listeners from the old data source.
        if(this.data_source != null)
            this.data_source.remove_update_listener(this.data_source_updated);

        this.data_source = data_source;

        this.search_view.set_data_source(data_source);

        if(this.data_source == null)
        {
            this.refresh_ui();
            return;
        }

        // Remove any previous data source's UI.
        if(this.current_data_source_ui)
        {
            this.current_data_source_ui.shutdown();
            this.current_data_source_ui = null;
        }

        // Create the new data source's UI.
        let data_source_ui_container = this.container.querySelector(".data-source-ui");
        this.current_data_source_ui = this.data_source.create_ui({ container: data_source_ui_container });

        // Disable the avatar widget unless the data source enables it.
        this.avatar_container.hidden = true;
        this.avatar_widget.set_user_id(null);

        // Listen to the data source loading new pages, so we can refresh the list.
        this.data_source.add_update_listener(this.data_source_updated);
        this.refresh_ui();
    };

    data_source_updated = () =>
    {
        this.refresh_ui();
    }

    refresh_search = () =>
    {
        main_controller.refresh_current_data_source({remove_search_page: true});
    }

    refresh_search_from_page = () =>
    {
        main_controller.refresh_current_data_source({remove_search_page: false});
    }
        
    initial_refresh_ui()
    {
        if(this.data_source == null)
            return;

        // Only show the "refresh from page" button if the data source supports start
        // pages.  If it doesn't, the two refresh buttons are equivalent.
        this.container.querySelector(".refresh-search-from-page-button").hidden = !this.data_source.supports_start_page;
    }

    refresh_ui = () =>
    {
        if(!this.active)
            return;

        if(this.thumbnail_ui)
            this.thumbnail_ui.refresh_ui();
        if(this.thumbnail_ui_mobile)
            this.thumbnail_ui_mobile.refresh_ui();

        this.data_source.set_page_icon();
        helpers.set_page_title(this.data_source.page_title || "Loading...");
        
        var ui_box = this.container.querySelector(".thumbnail-ui-box");
        this.data_source.refresh_thumbnail_ui({ container: ui_box, thumbnail_view: this });

        // Refresh whether we're showing the local navigation widget and toggle button.
        let local_search_active = this.data_source?.is_vview && !local_api?.local_info?.bookmark_tag_searches_only;
        helpers.set_dataset(this.container.dataset, "showNavigation", local_search_active && this.local_navigation_visible);

        this.refresh_ui_for_user_id();
        this.refresh_expand_manga_posts_button();
        this.refresh_refresh_search_from_page();
    };

    // Return the user ID we're viewing, or null if we're not viewing anything specific to a user.
    get viewing_user_id()
    {
        if(this.data_source == null)
            return null;
        return this.data_source.viewing_user_id;
    }

    // If the data source has an associated artist, return the "user:ID" for the user, so
    // when we navigate back to an earlier search, pulse_thumbnail will know which user to
    // flash.
    get displayed_media_id()
    {
        if(this.data_source == null)
            return super.displayed_media_id;

        let user_id = this.data_source.viewing_user_id;
        if(user_id != null)
            return "user:" + user_id;

        let folder_id = this.data_source.viewing_folder;
        if(folder_id != null)
            return folder_id;
    
        return super.displayed_media_id;
    }

    // Call refresh_ui_for_user_info with the user_info for the user we're viewing,
    // if the user ID has changed.
    refresh_ui_for_user_id = async() =>
    {
        // If we're viewing ourself (our own bookmarks page), hide the user-related UI.
        var initial_user_id = this.viewing_user_id;
        var user_id = initial_user_id == window.global_data.user_id? null:initial_user_id;

        var user_info = await user_cache.get_user_info_full(user_id);

        // Stop if the user ID changed since we started this request, or if we're no longer active.
        if(this.viewing_user_id != initial_user_id || !this.active)
            return;

        // Make a list of links to add to the top corner.
        //
        // If we reach our limit for the icons we can fit, we'll cut off at the end, so put
        // higher-priority links earlier.
        let extra_links = [];

        if(user_info != null)
        {
            extra_links.push({
                url: new URL(`/messages.php?receiver_id=${user_info.userId}`, ppixiv.plocation),
                type: "contact-link",
                label: "Send a message",
            });
            
            extra_links.push({
                url: new URL(`/users/${user_info.userId}/following#ppixiv`, ppixiv.plocation),
                type: "following-link",
                label: `View ${user_info.name}'s followed users`,
            });

            extra_links.push({
                url: new URL(`/users/${user_info.userId}/bookmarks/artworks#ppixiv`, ppixiv.plocation),
                type: "bookmarks-link",
                label: user_info? `View ${user_info.name}'s bookmarks`:`View bookmarks`,
            });

            extra_links.push({
                url: new URL(`/discovery/users#ppixiv?user_id=${user_info.userId}`, ppixiv.plocation),
                type: "similar-artists",
                label: "Similar artists",
            });
        }

        // Set the pawoo link.
        let pawoo_url = user_info?.social?.pawoo?.url;
        if(pawoo_url != null)
        {
            extra_links.push({
                url: pawoo_url,
                type: "pawoo-icon",
                label: "Pawoo",
            });
        }

        // Add the twitter link if there's one in the profile.
        let twitter_url = user_info?.social?.twitter?.url;
        if(twitter_url != null)
        {
            extra_links.push({
                url: twitter_url,
                type: "twitter-icon",
            });
        }

        // Set the circle.ms link.
        let circlems_url = user_info?.social?.circlems?.url;
        if(circlems_url != null)
        {
            extra_links.push({
                url: circlems_url,
                type: "circlems-icon",
                label: "Circle.ms",
            });
        }

        // Set the webpage link.
        //
        // If the webpage link is on a known site, disable the webpage link and add this to the
        // generic links list, so it'll use the specialized icon.
        let webpage_url = user_info?.webpage;
        if(webpage_url != null)
        {
            let type = this.find_link_image_type(webpage_url);
            extra_links.push({
                url: webpage_url,
                type: type || "webpage-link",
                label: "Webpage",
            });
        }

        // Find any other links in the user's profile text.
        if(user_info != null)
        {
            let div = document.createElement("div");
            div.innerHTML = user_info.commentHtml;

            let limit = 4;
            for(let link of div.querySelectorAll("a"))
            {
                extra_links.push({url: helpers.fix_pixiv_link(link.href)});

                // Limit these in case people have a ton of links in their profile.
                limit--;
                if(limit == 0)
                    break;
            }
        }

        // Let the data source add more links.  For Fanbox links this is usually delayed
        // since it requires an extra API call, so put this at the end to prevent the other
        // buttons from shifting around.
        if(this.data_source != null)
            this.data_source.add_extra_links(extra_links);

        // Remove any extra buttons that we added earlier.
        let row = this.container.querySelector(".button-row.user-links");
        for(let div of row.querySelectorAll(".extra-profile-link-button"))
            div.remove();
        
        // Map from link types to icons:
        let link_types = {
            ["default-icon"]: "ppixiv:link",
            ["shopping-cart"]: "mat:shopping_cart",
            ["twitter-icon"]: "ppixiv:twitter",
            ["fanbox-icon"]: "resources/icon-fanbox.svg",
            ["booth-icon"]: "ppixiv:booth",
            ["webpage-link"]: "mat:home",
            ["pawoo-icon"]: "resources/icon-pawoo.svg",
            ["circlems-icon"]: "resources/icon-circlems.svg",
            ["twitch-icon"]: "ppixiv:twitch",
            ["contact-link"]: "mat:mail",
            ["following-link"]: "resources/followed-users-eye.svg",
            ["bookmarks-link"]: "mat:star",
            ["similar-artists"]: "ppixiv:suggestions",
            ["request"]: "mat:paid",
        };

        let seen_links = {};
        for(let {url, label, type} of extra_links)
        {
            // Don't add the same link twice if it's in more than one place.
            if(seen_links[url])
                continue;
            seen_links[url] = true;

            try {
                url = new URL(url);
            } catch(e) {
                console.log("Couldn't parse profile URL:", url);
                continue;
            }

            // Guess the link type if one wasn't supplied.
            if(type == null)
                type = this.find_link_image_type(url);

            if(type == null)
                type = "default-icon";

            let entry = this.create_template({name: "extra-link", html: `
                <div class=extra-profile-link-button>
                    <a href=# class="extra-link icon-button popup popup-bottom" rel="noreferer noopener"></a>
                </div>
            `});

            let image_name = link_types[type];
            let icon;
            if(image_name.endsWith(".svg"))
                icon = helpers.create_ppixiv_inline(image_name);
            else
                icon = helpers.create_icon(image_name, { as_element: true });

            icon.classList.add(type);
            entry.querySelector(".extra-link").appendChild(icon);

            let a = entry.querySelector(".extra-link");
            a.href = url;

            // If this is a Twitter link, parse out the ID.  We do this here so this works
            // both for links in the profile text and the profile itself.
            if(type == "twitter-icon")
            {
                let parts = url.pathname.split("/");
                label = parts.length > 1? ("@" + parts[1]):"Twitter";
            }

            if(label == null)
                label = a.href;
            a.dataset.popup = decodeURIComponent(label);

            // Add the node at the start, so earlier links are at the right.  This makes the
            // more important links less likely to move around.
            row.insertAdjacentElement("afterbegin", entry);
        }

        // Mute/unmute
        if(user_id != null)
        {
            let entry = this.create_template({name: "mute-link", html: `
                <div class=extra-profile-link-button>
                    <span class="extra-link icon-button popup popup-bottom" rel="noreferer noopener">
                        ${ helpers.create_icon("block") }
                    </span>
                </div>
            `});
            
            let muted = muting.singleton.is_muted_user_id(user_id);
            let a = entry.querySelector(".extra-link");
            a.dataset.popup = `${muted? "Unmute":"Mute"} ${user_info?.name || "this user"}`;

            row.insertAdjacentElement("beforeend", entry);
            a.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if(muting.singleton.is_muted_user_id(user_id))
                    muting.singleton.unmute_user_id(user_id);
                else
                    await actions.add_mute(user_id, null, {type: "user"});
            });
        }

        // Tell the context menu which user is being viewed (if we're viewing a user-specific
        // search).
        main_context_menu.get.user_id = user_id;
    }

    // Use different icons for sites where you can give the artist money.  This helps make
    // the string of icons more meaningful (some artists have a lot of them).
    find_link_image_type(url)
    {
        url = new URL(url);

        let alt_icons = {
            "shopping-cart": [
                "dlsite.com",
                "fantia.jp",
                "skeb.jp",
                "ko-fi.com",
                "dmm.co.jp",
            ],
            "twitter-icon": [
                "twitter.com",
            ],
            "fanbox-icon": [
                "fanbox.cc",
            ],
            "booth-icon": [
                "booth.pm",
            ],
            "twitch-icon": [
                "twitch.tv",
            ],
        };

        // Special case for old Fanbox URLs that were under the Pixiv domain.
        if((url.hostname == "pixiv.net" || url.hostname == "www.pixiv.net") && url.pathname.startsWith("/fanbox/"))
            return "fanbox-icon";

        for(let alt in alt_icons)
        {
            // "domain.com" matches domain.com and *.domain.com.
            for(let domain of alt_icons[alt])
            {
                if(url.hostname == domain)
                    return alt;

                if(url.hostname.endsWith("." + domain))
                    return alt;
            }
        }
        return null;
    };

    async handle_onkeydown(e)
    {
        if(e.repeat)
            return;

        if(this.data_source.name == "vview")
        {
            // Pressing ^F while on the local search focuses the search box.
            if(e.code == "KeyF" && e.ctrlKey)
            {
                this.container.querySelector(".local-tag-search-box input").focus();
                e.preventDefault();
                e.stopPropagation();
            }

            // Pressing ^V while on the local search pastes into the search box.  We don't do
            // this for other searches since this is the only one I find myself wanting to do
            // often.
            if(e.code == "KeyV" && e.ctrlKey)
            {
                let text = await navigator.clipboard.readText();
                let input = this.container.querySelector(".local-tag-search-box input");
                input.value = text;
                local_api.navigate_to_tag_search(text, {add_to_history: false});
            }
        }
    }

    // Refresh the highlight for the "expand all posts" button.
    refresh_expand_manga_posts_button()
    {
        let enabled = this.search_view.media_ids_expanded_by_default;
        let button = this.container.querySelector(".expand-manga-posts");
        button.dataset.popup = enabled? "Collapse manga posts":"Expand manga posts";
        button.querySelector(".font-icon").innerText = enabled? "close_fullscreen":"open_in_full";
        
        // Hide the button if the data source can never return manga posts to be expanded, or
        // if it's the manga page itself which always expands.
        button.hidden =
            !this.data_source?.can_return_manga ||
            this.data_source?.includes_manga_pages;
    }

    refresh_refresh_search_from_page()
    {
        // Refresh the "refresh from page #" button popup.  This is updated by search_view
        // as the user scrolls.
        let start_page = this.data_source.get_start_page(helpers.args.location);
        this.container.querySelector(".refresh-search-from-page-button").dataset.popup = `Refresh search from page ${start_page}`;
    }
}

// Set the page URL to a slideshow, but don't actually start the slideshow.  This lets the
// user bookmark the slideshow URL before the illust ID changes from "*" to an actual ID.
// This is mostly just a workaround for an iOS UI bug: there's no way to create a home
// screen bookmark for a link, only for a URL that's already loaded.
//
// This is usually used from the search screen, but there's currently no good place to put
// it there, so it's inside the settings menu and technically can be accessed while viewing
// an image.
ppixiv.slideshow_staging_dialog = class extends ppixiv.dialog_widget
{
    static show()
    {
        let slideshow_args = main_controller.slideshow_url;
        if(slideshow_args == null)
            return;

        // Set the slideshow URL without sending popstate, so it'll be the current browser URL
        // that can be bookmarked but we won't actually navigate to it.  We don't want to navigate
        // to it since that'll change the placeholder "*" illust ID to a real illust ID, which
        // isn't what we want to bookmark.
        helpers.navigate(slideshow_args, { send_popstate: false });

        new slideshow_staging_dialog();
    }

    constructor({...options}={})
    {
        super({...options, header: "Slideshow",
        template: `
            <div class=items>
                This page can be bookmarked. or added to the home screen on iOS.<br>
                <br>
                The bookmark will begin a slideshow with the current search.
            </div>
        `});

        this.url = helpers.args.location;
    }

    visibility_changed()
    {
        super.visibility_changed();

        if(!this.visible)
        {
            // If the URL is still pointing at the slideshow, back out to restore the original
            // URL.  This is needed if we're exiting from the user clicking out of the dialog,
            // but don't do it if we're exiting from browser back.
            if(helpers.args.location.toString() == this.url.toString())
                ppixiv.phistory.back();
        }
    }
};

// This dialog shows the search filters that are in the header box on desktop.
class mobile_edit_search_dialog extends ppixiv.dialog_widget
{
    constructor({...options}={})
    {
        super({...options,
            dialog_class: "edit-search-dialog",
            header: "Search",
            template: `
                <div class="search-selection vertical-list">
                </div>
            `
        });

        // Create the menu items.  This is the same as the dropdown list for desktop.
        let option_box = this.container.querySelector(".search-selection");
        _create_main_search_menu(option_box);

        // Clicks on the artist row (if visible) shouldn't do anything.  It only has a dummy URL
        // to make it be used when an artist data source is active.
        this.artist_row = this.container.querySelector(".artist-row");
        this.artist_row.addEventListener("click", (e) => e.preventDefault());

        this.search_url = helpers.args.location;

        // Recreate the data source UI any time the URL changes, so we refresh when filters
        // are changed.
        window.addEventListener("popstate", (e) => this.refresh(), { signal: this.shutdown_signal.signal });
        this.refresh();
    }

    get active_row()
    {
        // We don't have any search modes in native, so just put the data source UI directly
        // in the scroller.
        if(ppixiv.native)
            return this.container.querySelector(".search-selection");

        // The active row is the one who would load a data source of the same class as the current one.
        let current_data_source = this.data_source;

        for(let button of this.container.querySelectorAll(".navigation-button"))
        {
            let url = new URL(button.href);
            let data_source_class = page_manager.singleton().get_data_source_for_url(url);

            if(current_data_source instanceof data_source_class)
                return button;

            // Hack: the bookmarks row corresponds to multiple subclasses.  All of them should
            // map back to the bookmarks row.
            if(current_data_source instanceof ppixiv.data_source_bookmarks_base &&
               data_source_class.prototype instanceof ppixiv.data_source_bookmarks_base)
               return button;
        }

        throw new Error("Couldn't match data source for", current_data_source.__proto__);
    }

    refresh()
    {
        let active_row = this.active_row;
        for(let button of this.container.querySelectorAll(".navigation-button"))
            helpers.set_class(button, "selected", button == active_row);

        // The artist row is hidden by default, since it only makes sense when already viewing
        // an artist.  If we're showing an artist, display it.
        let data_source_is_artist = this.data_source instanceof ppixiv.data_sources.artist;
        this.artist_row.widget.visible = data_source_is_artist;
        if(data_source_is_artist)
        {
            let username = this.data_source.user_info?.name;
            this.artist_row.querySelector(".label").innerText = username? `Artist: ${username}`:`Artist`;
        }
        this.recreate_ui();
    }

    // We always show the primary data source.
    get data_source()
    {
        return main_controller.data_source;
    }

    recreate_ui()
    {
        if(this.data_source_ui)
        {
            this.data_source_ui.shutdown();
            this.data_source_ui = null;
        }

        // Create the UI.
        let position = this.active_row;
        let row = position.closest(".box-link-row");
        if(row)
            position = row;

        this.data_source_ui = main_controller.data_source.create_ui({
            container: position,

            // Normally this goes after the search mode button.  When native we have no search mode
            // buttons and this.active_row is the container, so put it inside it.
            container_position: ppixiv.native? "beforeend":"afterend",

            parent: this,
        });

        if(this.data_source_ui)
        {
            this.data_source_ui.container.classList.add("data-source-ui");

            this.data_source.refresh_thumbnail_ui();
        }
    }

    // Tell dialog_widget not to close us on popstate.  It'll still close us if the screen changes.
    get _close_on_popstate() { return false; }
}
