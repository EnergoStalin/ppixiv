import Widget from '/vview/widgets/widget.js';
import WidgetDragger from '/vview/actors/widget-dragger.js';
import { helpers, OpenWidgets } from '/vview/misc/helpers.js';

export default class DialogWidget extends Widget
{
    // The stack of dialogs currently open:
    static activeDialogs = [];

    static get topDialog()
    {
        return this.activeDialogs[this.activeDialogs.length-1];
    }

    static _updateBlockTouchScrolling()
    {
        if(!window.ppixiv?.ios)
            return;

        // This is really annoying.  No matter how much you shout at iOS to not scroll the document,
        // whether with overflow: hidden, inert or pointer-events: none, it ignores you and scrolls
        // the document underneath the dialog.  The only way I've found to prevent this is by cancelling
        // touchmove (touchstart doesn't work).
        //
        // Note that even touch-action: none doesn't work.  It seems to interpret it as "don't let touches
        // on this element scroll" instead of "this element shouldn't scroll with touch": touches on child
        // elements will still propagate up and scroll the body, which is useless.
        //
        // This hack partially works, but the body still scrolls when it shouldn't if an area is dragged
        // which is set to overflow: auto or overflow: scroll but doesn't actually scroll.  We can't tell
        // that it isn't scrolling, and iOS seems to blindly propagate any touch on a potentially-scrollable
        // element up to the nearest scrollable one.
        if(DialogWidget.activeDialogs.length == 0)
        {
            if(this._removeTouchScrollerEvents != null)
            {
                this._removeTouchScrollerEvents.abort();
                this._removeTouchScrollerEvents = null;
            }
            return;
        }

        // At least one dialog is open.  Start listening to touchmove if we're not already.
        if(this._removeTouchScrollerEvents)
            return;

        this._removeTouchScrollerEvents = new AbortController();
        window.addEventListener("touchmove", (e) => {
            // Block this movement if it's not inside the topmost open dialog.
            let topDialog = DialogWidget.topDialog;
            let dialog = topDialog.root.querySelector(".dialog");
            if(!helpers.html.isAbove(dialog, e.target))
                e.preventDefault();
        }, { capture: true, passive: false, signal: this._removeTouchScrollerEvents.signal });
    }

    constructor({
        classes=null,
        container=null,
        // "normal" is used for larger dialogs, like settings.
        // "small" is used for smaller popups like text entry.
        dialogType="normal",

        dialogClass=null,

        // The header text:
        header=null,

        // Most dialogs have a close button and allow the user to navigate away.  To
        // disable this and control visibility directly, set this to false.
        allowClose=true,

        // Most dialogs that can be closed have a close button in the corner.  If this is
        // false we'll hide that button, but you can still exit by clicking the background.
        // This is used for very simple dialogs.
        showCloseButton=true,

        // If false, this dialog may be large, like settings, and we'll display it in fullscreen
        // on small screens.  If true, weit's a small dialog like a confirmation prompt, and we'll
        // always show it as a floating dialog.  The default is true if dialogType == "small",
        // otherwise false.
        small=null,

        // If true, the close button shows a back icon instead of an X.
        backIcon=false,

        template,
        ...options
    })
    {
        if(small == null)
            small = dialogType == "small";

        // Most dialogs are added to the body element.
        if(container == null)
            container = document.body;
        
        console.assert(dialogType == "normal" || dialogType == "small");

        if(dialogClass == null)
            dialogClass = dialogType == "normal"? "dialog-normal":"dialog-small";

        let closeIcon = backIcon? "arrow_back_ios_new":"close";
        
        super({
            container,
            template: `
                <div class="${dialogClass}">
                    <div class="dialog ${classes ?? ""}">
                        <div class=header>
                            <div class="close-button-container">
                                <div class="close-button icon-button">
                                    ${ helpers.createIcon(closeIcon) }
                                </div>
                            </div>

                            <button class="header-text copyable-text-button"></button>

                            <div class=center-header-helper></div>
                        </div>
                        <div class="scroll vertical-scroller">
                            ${ template }
                        </div>
                    </div>
                </div>
            `,
            ...options,
        });

        this.root.querySelector(".header-text")
            .addEventListener("click", (e) => navigator.clipboard.writeText(e.target.textContent));

        // Always hide the close button on mobile.
        if(window.ppixiv?.mobile)
            showCloseButton = false;

        // Dialogs are always used once and not reused, so they should never be created invisible.
        if(!this.visible)
            throw new Error("Dialog shouldn't be hidden");

        this.small = small;
        helpers.html.setClass(this.root, "small", this.small);
        helpers.html.setClass(this.root, "large", !this.small);
        this.dragToExit = true;

        this.refreshDialogMode();
        window.addEventListener("resize", () => this.refreshDialogMode(), this._signal);

        // Create the dragger that will control animations.  Animations are only used on mobile.
        if(window.ppixiv?.mobile)
        {
            this._dialogDragger = new WidgetDragger({
                parent: this,
                name: "close-dialog",
                nodes: this.root,
                dragNode: this.root,
                visible: false,
                duration: 200,
                animatedProperty: "--dialog-visible",
                direction: "up", // up opens, down closes
                onbeforeshown: () => this.callVisibilityChanged(),
                onafterhidden: () => this.callVisibilityChanged(),

                confirmDrag: ({event}) => {
                    // This is still used for transitions even if it's not used for drags, but only
                    // allow dragging if dragToExit is true.
                    if(!this.dragToExit)
                        return false;

                    // If this dialog closes by dragging down, only begin the drag if the scroller
                    // is already scrolled to the top.  Otherwise, allow the scroller to scroll.
                    //
                    // On iOS, don't scroll if we're overscrolled past the top, to roughly match the
                    // native behavior.  We use a small threshold here so we do start if we're just
                    // slightly past it (this also roughly matches native).
                    //
                    // If the drag touch is outside the scroller, such as on the title, always allow
                    // the drag to start.
                    let scroll = this.querySelector(".scroll");
                    if(helpers.html.isAbove(scroll, event.target))
                    {
                        // We're overscrolled if scrollTop is negative.  Give a bit of leeway, so
                        // we can scroll to hide even if there's a bit of scrolling.
                        if(scroll.scrollTop > 0 || scroll.scrollTop < -25)
                            return false;
                    }

                    return true;
                },

                // The drag size and the transition should have the same distance, so drags are synchronized.
                // The drag distance is controlled by the dialog transform and transforms by 100% of the height,
                // which this matches.  The two can be out of sync briefly if the dialog refreshes and changes
                // its contents.
                size: () => {
                    return this.querySelector(".dialog").getBoundingClientRect().height;
                },

                // Set dragging while dragging the dialog to disable the scroller.
                onactive: () => this.root.classList.add("dragging-dialog"),
                oninactive: () => this.root.classList.remove("dragging-dialog"),
            });
        }

        // If we're not the first dialog on the stack, make the previous dialog inert, so it'll ignore inputs.
        let oldTopDialog = DialogWidget.topDialog;
        if(oldTopDialog)
            oldTopDialog.root.inert = true;

        // Add ourself to the stack.
        DialogWidget.activeDialogs.push(this);

        // Register ourself as an important visible widget, so the slideshow won't move on
        // while we're open.
        OpenWidgets.singleton.set(this, true);

        if(!header && !showCloseButton)
            this.root.querySelector(".header").hidden = true;

        this.allowClose = allowClose;
        this.root.querySelector(".close-button").hidden = !allowClose || !showCloseButton;
        this.header = header;

        window.addEventListener("keydown", this._onkeypress.bind(this), { signal: this.shutdownSignal });

        if(this.allowClose)
        {
            // Close if the container is clicked, but not if something inside the container is clicked.
            this.root.addEventListener("click", (e) => {
                if(e.target != this.root)
                    return;

                this.visible = false;
            });

            let closeButton = this.root.querySelector(".close-button");
            if(closeButton)
                closeButton.addEventListener("click", (e) => { this.visible = false; });

            // Hide if the top-level screen changes, so we close if the user exits the screen with browser
            // navigation but not if the viewed image is changing from something like the slideshow.  Call
            // shutdown() directly instead of setting visible, since we don't want to trigger animations here.
            window.addEventListener("screenchanged", (e) => {
                this.shutdown();
            }, { signal: this.shutdownSignal });

            if(this._close_on_popstate)
            {
                // Hide on any state change.
                window.addEventListener("pp:popstate", (e) => {
                    this.shutdown();
                }, { signal: this.shutdownSignal });
            }
        }

        DialogWidget._updateBlockTouchScrolling();
    }

    afterInit()
    {
        // Show the dragger.  Do this after the ctor so we aren't causing visibility callbacks
        // before the subclass is set up.
        if(this._dialogDragger)
            this._dialogDragger.show();

        super.afterInit();
    }

    // The subclass can override this to disable automatically closing on popstate.
    get _close_on_popstate() { return true; }

    set header(value)
    {
        this.root.querySelector(".header-text").textContent = value ?? "";
    }

    refreshDialogMode()
    {
        helpers.html.setClass(this.root, "floating", !helpers.other.isPhone() || this.small);
    }

    visibilityChanged()
    {
        super.visibilityChanged();

        // Remove the widget when it's hidden.  If we're animating, we'll do this after transitionend.
        if(!this.actuallyVisible)
            this.shutdown();
    }

    _onkeypress(e)
    {
        let idx = DialogWidget.activeDialogs.indexOf(this);
        if(idx == -1)
        {
            console.error("Widget isn't in activeDialogs during keypress:", this);
            return;
        }

        // Ignore keypresses if we're not the topmost dialog.
        if(idx != DialogWidget.activeDialogs.length-1)
            return;

        if(this._handleKeydown(e))
        {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    // This can be overridden by the implementation.
    _handleKeydown(e)
    {
        if(this.allowClose && e.key == "Escape")
        {
            this.visible = false;
            return true;
        }

        return false;
    }

    get actuallyVisible()
    {
        // If we have an animator, it determines whether we're visible.
        if(this._dialogDragger)
            return this._dialogDragger.visible;
        else
            return super.visible;
    }

    async applyVisibility()
    {
        if(this._dialogDragger == null || this._visible)
        {
            super.applyVisibility();
            return;
        }

        // We're being hidden and we have an animation.  Tell the dragger to run our hide
        // animation.  We'll shut down when it finishes.  Make this animation uninterruptible,
        // so it can't be interrupted by dragging.
        this._dialogDragger.hide({interruptible: false});
    }

    // If a dragger animation is running, return its completion promise.
    visibilityChangePromise()
    {
        return this._dialogDragger?.finished;
    }

    // Calling shutdown() directly will remove the dialog immediately.  To remove it and allow
    // animations to run, set visible to false, and the dialog will shut down when the animation
    // finishes.
    shutdown()
    {
        // Remove ourself from activeDialogs.
        let idx = DialogWidget.activeDialogs.indexOf(this);
        if(idx == -1)
            console.error("Widget isn't in activeDialogs when shutting down:", this);
        else
            DialogWidget.activeDialogs.splice(idx, 1);

        // Tell OpenWidgets that we're no longer open.
        OpenWidgets.singleton.set(this, false);

        DialogWidget._updateBlockTouchScrolling();

        // If we were covering another dialog, unset inert on the previous dialog.
        let newTopDialog = DialogWidget.topDialog;
        if(newTopDialog)
            newTopDialog.root.inert = false;

        super.shutdown();
    }
}
