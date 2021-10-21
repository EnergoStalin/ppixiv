"use strict";

// The base class for our main screens.
ppixiv.screen = class
{
    constructor(container)
    {
        this.container = container;

        // Make our container focusable, so we can give it keyboard focus when we
        // become active.
        this.container.tabIndex = -1;
    }

    // Handle a key input.  This is only called while the screen is active.
    handle_onkeydown(e)
    {
    }

    // Return the view that navigating back in the popup menu should go to.
    get navigate_out_target() { return null; }

    // If this screen is displaying an image, return its ID.
    // If this screen is displaying a user's posts, return "user:ID".
    // Otherwise, return null.
    get displayed_illust_id()
    {
        return null;
    }

    // If this screen is displaying a manga page, return its ID.  Otherwise, return null.
    // If this is non-null, displayed_illust_id will always also be non-null.
    get displayed_illust_page()
    {
        return null;
    }

    // These are called to restore the scroll position on navigation.
    scroll_to_top() { }
    restore_scroll_position() { }
    scroll_to_illust_id(illust_id, manga_page) { }

    set_active(active)
    {
        // Show or hide the screen.
        this.container.hidden = !active;
        
        if(active)
        {
            // Focus the container, so it receives keyboard events, eg. home/end.
            this.container.focus();
        }
        else
        {
            // When the screen isn't active, send viewhidden to close all popup menus inside it.
            view_hidden_listener.send_viewhidden(this.container);
        }
    }
}

