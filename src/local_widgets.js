// Widgets only used for local file navigation.

ppixiv.tree_widget = class extends ppixiv.widget
{
    constructor({
        add_root=true,
        ...options})
    {
        super({...options, template: `
            <div class=tree>
                <div class=items>
                </div>
            </div>
        `});

        this.label_popup = this.create_template({html: `
            <div class=tree-popup>
                <div class=label></div>
            </div>
        `});

        this.thumb_popup = this.create_template({html: `
            <div class=thumb-popup>
                <img class=img></div>
            </div>
        `});

        this.items = this.container.querySelector(".items");

        this.container.addEventListener("mouseenter", (e) => {
            let item = this.get_widget_from_element(e.target);
            this.set_hover(item);
        }, {
            capture: true,
        });

        this.container.addEventListener("mouseleave", (e) => {
            let item = this.get_widget_from_element(e.target);
            this.set_hover(item);
        }, {
            capture: true,
        });
    
        // Create the root item.  This is tree_widget_item or a subclass.
        if(add_root)
        {
            let root = new ppixiv.tree_widget_item({
                parent: this,
                label: "root",
                root: true,
            });

            this.set_root(root);
        }
    }
    
    // Given an element, return the tree_widget_item label it's inside, if any.
    get_widget_from_element(element)
    {
        let label = element.closest(".tree-item > .self > .label");
        if(label == null)
            return null;

        let item = label.closest(".tree-item");
        return item.widget;
    }

    set_root(root)
    {
        if(this.root == root)
            return;

        // If we have another root, remove it from this.items.
        if(this.root)
        {
            this.root.container.remove();
            this.root = null;
        }

        this.root = root;

        // Add the new root to this.items.
        if(root.container.parentNode != this.items)
        {
            console.assert(root.parentNode == null);
            this.items.appendChild(root.container);
        }

        // Root nodes are always expanded.
        root.expanded = true;
    }

    set_selected_item(item)
    {
        if(this.selected_item == item)
            return;

        this.selected_item = item;
        for(let node of this.container.querySelectorAll(".tree-item.selected"))
            node.classList.remove("selected");

        if(item != null)
        {
            item.container.classList.add("selected");

            // If the item isn't visible, center it.
            //
            // Bizarrely, while there's a full options dict for scrollIntoView and you
            // can control horizontal and vertical scrolling separately, there's no "none"
            // option so you can scroll vertically and not horizontally.
            let scroll_container = this.container;
            let label = item.container.querySelector(".label");

            let old_scroll_left = scroll_container.scrollLeft;

            label.scrollIntoView({ block: "nearest" });

            scroll_container.scrollLeft = old_scroll_left;
        }
    }

    // Update the hover popup.  This allows seeing the full label without needing
    // a horizontal scroller, and lets us display a quick thumbnail.
    set_hover(item)
    {
        if(item == null)
        {
            this.label_popup.remove();
            this.thumb_popup.remove();
            return;
        }

        let label = item.container.querySelector(".label");
        let {top, left, bottom, height} = label.getBoundingClientRect();

        // Set up thumb_popup.
        if(item.path)
        {
            let {right} = this.container.getBoundingClientRect();
            this.thumb_popup.style.left = `${right}px`;

            // If the label is above halfway down the screen, position the preview image
            // below it.  Otherwise, position it below.  This keeps the image from overlapping
            // the label.  We don't know the dimensions of the image here.
            let label_center = top + height/2;
            let below_middle = label_center > window.innerHeight/2;

            let img = this.thumb_popup.querySelector("img");
            if(below_middle)
            {
                // Align the bottom of the image to the top of the label.
                this.thumb_popup.style.top = `${top - 20}px`;
                img.style.objectPosition = "left bottom";
                this.thumb_popup.style.transform = "translate(0, -100%)";
            } else {
                // Align the top of the image to the bottom of the label.
                this.thumb_popup.style.top = `${bottom+20}px`;
                img.style.objectPosition = "left top";
                this.thumb_popup.style.transform = "";
            }

            let url = new URL(helpers.local_url);
            url.pathname = "thumb/" + item.path;
            img.src = url;
            document.body.appendChild(this.thumb_popup);
        }

        // Set up label_popup.
        {
            this.label_popup.style.left = `${left}px`;
            this.label_popup.style.top = `${top}px`;

            // Match the padding of the label.
            this.label_popup.style.padding = getComputedStyle(label).padding;
            this.label_popup.querySelector(".label").innerText = item.label.innerText;
            document.body.appendChild(this.label_popup);
        }
    }
}

ppixiv.tree_widget_item = class extends ppixiv.widget
{
    // If root is true, this is the root item being created by a tree_widget.  Our
    // parent is the tree_widget and our container is tree_widget.items.
    //
    // If root is false (all items created by the user) and parent is a tree_widget, our
    // real parent is the tree_widget's root item.  Otherwise, parent is always another
    // tree_widget_item.
    constructor({
        parent,
        label,

        root=false,

        // If true, this item might have children.  The first time the user expands
        // it, onexpand() will be called to populate it.
        pending=false,
        expandable=false,

        // If true and this is a root node, hide the label.
        hide_if_root=true,
        ...options
    }={})
    {
        // If this isn't a root node and parent is a tree_widget, use the tree_widget's
        // root node as our parent instead of the tree widget itself.
        if(!root && parent instanceof ppixiv.tree_widget)
            parent = parent.root;

        super({...options,
            // The container is our parent node's item list.
            container: parent.items,
            parent: parent,
            template: `
            <div class=tree-item>
                <div class=self tabindex=1>
                    <div class=expander data-mode="loading">
                        <span class="expander-button expand">▶</span>
                        <span class="expander-button loading">⌛</span>
                        <span class="expander-button none"></span>
                    </div>
                    <div class=label></div>
                </div>

                <div class=items></div>
            </div>
        `});

        // If this is the root node, hide .self, and add .root so our children
        // aren't indented.
        if(root && hide_if_root)
        {
            this.container.querySelector(".self").hidden = true;
            this.container.classList.add("root");
        }

        // If our parent is the root node, we're a top-level node.
        helpers.set_class(this.container, "top", !root && parent.root);
        helpers.set_class(this.container, "child", !root && !parent.root);

        this.items = this.container.querySelector(".items");
        this.expander = this.container.querySelector(".expander");
        this.expand_mode = "expandable";
        this.is_root = root;
        this._expandable = expandable;
        this._expanded = false;
        this._pending = pending;

        // Our root node:
        this.root_node = root? this:this.parent.root_node;

        // If we're the root node, the tree is our parent.  Otherwise, copy the tree from
        // our parent.
        this.tree = root? this.parent:this.parent.tree;

        this.expander.addEventListener("click", (e) => {
            this.expanded = !this.expanded;
        });

        this.container.querySelector(".label").addEventListener("dblclick", (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();

            this.expanded = !this.expanded;
        });

        this.label = this.container.querySelector(".label");
        this.label.innerText = label;

        this.container.querySelector(".label").addEventListener("mousedown", (e) => {
        if(e.button != 0)
                return;

        e.preventDefault();
        e.stopImmediatePropagation();

        this.select();
        this.onclick();
        }, { capture: true });

        this.refresh_expand_mode();

        if(this.parent instanceof ppixiv.tree_widget_item)
        {
            this.parent.refresh_expand_mode();
        }
    }

    // This is called if pending is set to true the first time the node is expanded.
    async onexpand() { }

    // This is called when the item is clicked.
    onclick() { }

    set expanded(value)
    {
        if(this._expanded == value)
            return;

        // Don't unexpand the root.
        if(!value && this.is_root)
            return;

        this._expanded = value;

        // If we're pending, call onexpand the first time we're expanded so we can
        // be populated.  We'll stay pending and showing the hourglass until onexpand
        // completes.
        if(this._expanded && this._pending)
        {
            if(!this.called_onexpand)
            {
                this.called_onexpand = true;
                this.load_promise = (async() => {
                    try {
                        await this.onexpand();
                    } finally {
                        this.pending = false;
                        this.load_promise = null;
                    }
                })();
            }
        }

        this.refresh_expand_mode();
    }

    set expandable(value)
    {
        if(this._expandable == value)
            return;
        this._expandable = value;
        this.refresh_expand_mode();
    }

    set pending(value)
    {
        if(this._pending == value)
            return;
        this._pending = value;
        this.refresh_expand_mode();
    }

    get expanded() { return this._expanded;}
    get expandable() { return this._expandable; }
    get pending() { return this._pending; }
    
    // Return an array of this node's child tree_widget_items.
    get child_nodes()
    {
        let result = [];
        for(let child = this.items.firstElementChild; child != null; child = child.nextElementSibling)
            if(child.widget)
                result.push(child.widget);
        return result;
    }

    get displayed_expand_mode()
    {
        // If we're not pending and we have no children, show "none".
        if(!this._pending && this.items.firstElementChild == null)
            return "none";

        // If we're expanded and pending, show "loading".  We're waiting for onexpand
        // to finish loading and unset pending.
        if(this.expanded)
            return this._pending? "loading":"expanded";

        return "expandable";
    }

    refresh_expand_mode()
    {
        this.expander.dataset.mode = this.displayed_expand_mode;
        this.expander.dataset.pending = this._pending;
        this.items.hidden = !this._expanded || this._pending;
    }

    select()
    {
        this.tree.set_selected_item(this);
    }

    focus()
    {
        this.container.querySelector(".self").focus();
    }

    remove()
    {
        if(this.parent == null)
            return;

        this.parent.items.remove(this.container);

        // Refresh the parent in case we're the last child.
        this.parent.refresh_expand_mode();

        this.parent = null;
    }
};

class local_navigation_widget_item extends ppixiv.tree_widget_item
{
    constructor({path, search_options=null, ...options}={})
    {
        super({...options,
            expandable: true,
            pending: true,
        });

        // If this is the root node, fill in the path.
        if(options.root)
            this.path = "folder:/";
        else
            this.path = path;

        if(options.root)
        {
            // As we load nodes in this tree, we'll index them by ID here.
            this.nodes = {};
            this.nodes[path] = this;
        }

        this.search_options = search_options;
    }

    async onexpand()
    {
        await this.load();
    }

    onclick()
    {
        this.tree.show_item(this.path);
    }

    load()
    {
        if(this.loaded)
            return;

        // If we're already loading this item, just let it complete.
        if(this.load_promise)
            return this.load_promise;

        this.load_promise = this.load_inner();

        this.load_promise.finally(() => {
            this.load_promise = null;

            // Refresh the selection in case this loaded the search we're currently on.
            this.tree.refresh_selection();
        });

        return this.load_promise;
    }

    async load_inner(item)
    {
        if(this.loaded)
            return;

        let result = await helpers.local_post_request("/api/list", {
            ...this.search_options,
            id: this.path,

            // This tells the server to only include directories.  It's much faster, since
            // it doesn't need to scan images for metadata, and it disables pagination and gives
            // us all results at once.
            directories_only: true,
        });

        if(!result.success)
        {
            console.error("Error reading directory:", result);
            return;
        }

        // If this is the top-level item, this is a list of archives.  If we have only one
        // archive, populate the top level with the top leve of the archive instead, so we
        // don't have an expander with just one item.
        // Not sure this is worth it.  It adds special cases elsewhere, since it makes the
        // tree structure different (local_navigation_widget.load_path is broken, etc).
        /*
        if(this.path == "folder:/" && result.results.length == 1)
        {
            // Top-level items are always folders.
            console.assert(result.results[0].id.startsWith("folder:/"));
            this.path = result.results[0].id;
            return await this.load_inner();
        }
        */

        this.loaded = true;

        for(let dir of result.results)
        {
            // Strip "folder:" off of the name, and use the basename of that as the label.
            let {type, id: label} = helpers.parse_id(dir.id);
            if(type != "folder")
                continue;
    
            // Don't propagate search_options to children.
            label = label.replace(/.*\//, "");
            let child = new local_navigation_widget_item({
                parent: this,
                label: label,
                path: dir.id,
            });

            // Store ourself on the root node's node list.
            this.root_node.nodes[child.path] = child;
        }
    }
}

// A tree view for navigation with the local image API.
// XXX: highlight the current path
// XXX: keyboard navigation
ppixiv.local_navigation_widget = class extends ppixiv.tree_widget
{
    constructor({...options}={})
    {
        super({...options,
            add_root: false,
        });

        // Root local_navigation_widget_items will be stored here when
        // set_data_source_search_options is called.  Until that happens, we have
        // no root.
        this.roots = {};

        // Set current_search_options to a sentinel so we'll always set it on the
        // first call to set_data_source_search_options.
        this.current_search_options = new Object();

        window.addEventListener("popstate", (e) => {
            this.refresh_selection();
        });
        this.refresh_selection();
    }

    // The data source calls this to tell us the current search parameters, which
    // we also use to fill the tree.  For viewing the directory tree, search_options
    // is { }.
    set_data_source_search_options(search_options, { search_title })
    {
        if(this.current_search_options == search_options)
            return;

        // Note that search_options is null if we're showing the regular tree and no
        // search is active.
        this.current_search_options = search_options;

        // Use a JSON serialization as a key.  This always serializes in the same way.
        let search_options_json = JSON.stringify(search_options);
        if(this.roots[search_options_json] == null)
        {
            // Create this tree.
            this.roots[search_options_json] = new local_navigation_widget_item({
                parent: this,
                label: search_title? search_title:"Root",
                root: true,

                // Hide the root node if there's no search, so the file tree roots are at the top.
                hide_if_root: !this.showing_search,

                // Searches always start at the root.
                path: "folder:/",
                search_options: search_options,
            });
        }

        this.set_root(this.roots[search_options_json]);
    }

    // Return true if we're displaying a search, or false if we're showing the filesystem tree.
    get showing_search()
    {
        return this.current_search_options != null;
    }

    set_root(root)
    {
        super.set_root(root);
        
        // Make sure the new root is loaded.
        root.load();
    }

    // If a search is active, select its item.
    async refresh_selection()
    {
        if(this.root == null)
            return;

        // If we're not on a /local/ search, just deselect.
        let args = new helpers.args(ppixiv.location);
        if(args.path != "/local/")
        {
            this.set_selected_item(null);
            return;
        }

        // If node doesn't have a node, load its parents.
        await this.load_path(args.hash_path);

        // If we loaded the path, select it.
        let selected_id = "folder:" + args.hash_path;
        let node = this.root.nodes[selected_id];
        if(node)
        {
            node.select();
            return;
        }
    }

    // Load and expand each component of path.
    // XXX: try to find the path underneath the current selection first?
    // unless the user clicks somewhere else
    // XXX: stop if the selection changes
    // load_path(null)
    async load_path(path)
    {
        // Stop if we don't have a root yet.
        if(this.root == null)
            return;

        // Wait until the root is loaded, if needed.
        await this.root.load();
        
        // Split apart the path.
        let parts = path.split("/");

        // Discard the last component.  We only need to load the directory containing the
        // path, not the directory itself.
        parts.splice(parts.length-1, 1);

        // Incrementally load each directory component.
        //
        // Note that if we're showing a search, items at the top of the tree will be from
        // random places further down the filesystem.  We can do the same thing here: if
        // we're trying to load /a/b/c/d/e and the search node points to /a/b/c, we skip
        // /a and /a/b which aren't in the tree and start loading from there.
        let current_path = "";
        for(let part of parts)
        {
            // Append this path component to current_path.
            if(current_path == "")
                current_path = "folder:/";
            else if(current_path != "folder:/")
                current_path += "/";
            current_path += part;

            // If this directory exists in the tree, it'll be in nodes by now.
            let node = this.root.nodes[current_path];
            if(node == null)
            {
                // console.log("Path doesn't exist:", current_path);
                continue;
            }

            // Expand the node.  This will trigger a load if needed.
            node.expanded = true;

            // If the node is loading, wait for the load to finish.
            if(node.load_promise)
                await node.load_promise;
        }
    }

    // Navigate to illust_id, which should be an entry in the current tree.
    show_item(illust_id)
    {
        let { id } = helpers.parse_id(illust_id);
        let args = new helpers.args(ppixiv.location);

        // Don't navigate if we're already here.
        if(args.hash_path == id)
            return;
        
        // We expect to be on the local data source when this is called.
        console.assert(args.path == "/local/");
        args.hash_path = id;

        helpers.set_page_url(args, true /* add_to_history */, "navigation");
    }
};

// local_search_box_widget and local_search_dropdown_widget are dumb copy-pastes
// of tag_search_box_widget and tag_search_dropdown_widget.  They're simpler and
// much less used, and it didn't seem worth creating a shared base class for these.
ppixiv.local_search_box_widget = class extends ppixiv.widget
{
    // This stores searches like helpers.add_recent_search_tag.  It's simpler, since this
    // is the only place these searches are added.
    add_recent_local_search(tag)
    {
        var recent_tags = settings.get("local_searches") || [];
        var idx = recent_tags.indexOf(tag);
        if(idx != -1)
            recent_tags.splice(idx, 1);
        recent_tags.unshift(tag);

        settings.set("local_searches", recent_tags);
    }

    remove_recent_local_search(search)
    {
        // Remove tag from the list.  There should normally only be one.
        var recent_tags = settings.get("local_searches") || [];
        while(1)
        {
            var idx = recent_tags.indexOf(search);
            if(idx == -1)
                break;
            recent_tags.splice(idx, 1);
        }
        settings.set("local_searches", recent_tags);
    }

    constructor({...options})
    {
        super(options);

        this.input_onfocus = this.input_onfocus.bind(this);
        this.submit_search = this.submit_search.bind(this);

        this.input_element = this.container.querySelector(".search-tags");

        this.dropdown_widget = new local_search_dropdown_widget({
            container: this.container,
            input_element: this.container.querySelector(".search-tags"),
            focus_parent: this.container,
        });

        this.input_element.addEventListener("focus", this.input_onfocus);

        // Search submission:
        helpers.input_handler(this.input_element, this.submit_search);

        // Hide the dropdowns on navigation.
        new view_hidden_listener(this.input_element, (e) => {
            this.dropdown_widget.hide();
        });
    }

    // Show the dropdown when the input is focused.  Hide it when the input is both
    // unfocused and this.container isn't being hovered.  This way, the input focus
    // can leave the input box to manipulate the dropdown without it being hidden,
    // but we don't rely on hovering to keep the dropdown open.
    input_onfocus(e)
    {
        this.input_focused = true;
        this.dropdown_widget.show();
    }

    submit_search(e)
    {
        // This can be sent to either the search page search box or the one in the
        // navigation dropdown.  Figure out which one we're on.
        var tags = this.input_element.value.trim();
        if(tags.length == 0)
            return;

        // Add this tag to the recent search list.
        this.add_recent_local_search(tags);

        // If we're submitting by pressing enter on an input element, unfocus it and
        // close any widgets inside it (tag dropdowns).
        if(e.target instanceof HTMLInputElement)
        {
            e.target.blur();
            view_hidden_listener.send_viewhidden(e.target);
        }
        
        // Run the search.  We expect to be on the local data source when this is called.
        let args = new helpers.args(ppixiv.location);
        console.assert(args.path == "/local/");
        args.hash_path = "/";
        args.hash.set("search", tags);
        helpers.set_page_url(args, true /* add_to_history */, "navigation");
    }
}

ppixiv.local_search_dropdown_widget = class extends ppixiv.widget
{
    constructor({input_element, focus_parent, ...options})
    {
        super({...options, template: `
            <div class=search-history>
                <!-- This is to make sure there isn't a gap between the input and the dropdown,
                    so we don't consider the mouse out of the box when it moves from the input
                    to the autocomplete box. -->
                <div class=hover-box style="top: -10px; width: 100%; z-index: -1;"></div>
                    
                <div class=input-dropdown>
                    <div class=input-dropdown-list>
                        <!-- template-tag-dropdown-entry instances will be added here. -->
                    </div>
                </div>
            </div>
        `});

        this.dropdown_onclick = this.dropdown_onclick.bind(this);
        this.window_onclick = this.window_onclick.bind(this);

        this.input_element = input_element;

        // While we're open, we'll close if the user clicks outside focus_parent.
        this.focus_parent = focus_parent;

        this.container.addEventListener("click", this.dropdown_onclick);

        // input-dropdown is resizable.  Save the size when the user drags it.
        this.input_dropdown = this.container.querySelector(".input-dropdown");
        let observer = new MutationObserver((mutations) => {
            // resize sets the width.  Use this instead of offsetWidth, since offsetWidth sometimes reads
            // as 0 here.
            settings.set("tag-dropdown-width", this.input_dropdown.style.width);
        });
        observer.observe(this.input_dropdown, { attributes: true });

        // Restore input-dropdown's width.  Force a minimum width, in case this setting is saved incorrectly.
        this.input_dropdown.style.width = settings.get("tag-dropdown-width", "400px");

        this.shown = false;
        this.container.hidden = true;

        // Sometimes the popup closes when searches are clicked and sometimes they're not.  Make sure
        // we always close on navigation.
        this.container.addEventListener("click", (e) => {
            if(e.defaultPrevented)
                return;
            let a = e.target.closest("A");
            if(a == null)
                return;

            this.input_element.blur();
            this.hide();
        });
    }

    // Hide if the user clicks outside us.
    window_onclick(e)
    {
        if(helpers.is_above(this.focus_parent, e.target))
            return;

        this.hide();
    }

    dropdown_onclick(e)
    {
        var remove_entry = e.target.closest(".remove-history-entry");
        if(remove_entry != null)
        {
            // Clicked X to remove a tag from history.
            e.stopPropagation();
            e.preventDefault();
            var tag = e.target.closest(".entry").dataset.tag;
            helpers.remove_recent_local_search(tag);
            return;
        }

        // Close the dropdown if the user clicks a tag (but not when clicking
        // remove-history-entry).
        if(e.target.closest(".tag"))
            this.hide();
    }

    show()
    {
        if(this.shown)
            return;
        this.shown = true;

        // Fill in the dropdown before displaying it.
        this.populate_dropdown();

        this.container.hidden = false;

        window.addEventListener("click", this.window_onclick, true);
        helpers.set_max_height(this.input_dropdown);
    }

    hide()
    {
        if(!this.shown)
            return;
        this.shown = false;

        this.container.hidden = true;
        window.addEventListener("click", this.window_onclick, true);

        // Make sure the input isn't focused.
        this.input_element.blur();
    }

    create_entry(search)
    {
        let entry = this.create_template({name: "tag-dropdown-entry", html: `
            <a class=entry href=#>
                <span class=search></span>
                <span class="remove-history-entry keep-menu-open">X</span>
            </div>
        `});
        entry.dataset.tag = search;

        let span = document.createElement("span");
        span.innerText = search;

        entry.querySelector(".search").appendChild(span);

        let args = new helpers.args("/", ppixiv.location);
        args.path = "/local/";
        args.hash_path = "/";
        args.hash.set("search", search);
        entry.href = args.url;
        return entry;
    }

    // Populate the tag dropdown.
    populate_dropdown()
    {
        let tag_searches = settings.get("local_searches") || [];
        tag_searches.sort();

        let list = this.container.querySelector(".input-dropdown-list");
        helpers.remove_elements(list);

        for(let tag of tag_searches)
        {
            var entry = this.create_entry(tag);
            entry.classList.add("history");
            list.appendChild(entry);
        }
    }
}
