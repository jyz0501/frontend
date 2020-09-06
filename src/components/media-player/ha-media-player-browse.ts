import "@material/mwc-button/mwc-button";
import "@material/mwc-fab/mwc-fab";
import "@material/mwc-list/mwc-list";
import "@material/mwc-list/mwc-list-item";
import { mdiArrowLeft, mdiClose, mdiFolder, mdiPlay, mdiPlus } from "@mdi/js";
import "@polymer/paper-item/paper-item";
import "@polymer/paper-listbox/paper-listbox";
import {
  css,
  CSSResultArray,
  customElement,
  html,
  internalProperty,
  LitElement,
  property,
  PropertyValues,
  TemplateResult,
} from "lit-element";
import { classMap } from "lit-html/directives/class-map";
import { ifDefined } from "lit-html/directives/if-defined";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../common/dom/fire_event";
import { computeRTLDirection } from "../../common/util/compute_rtl";
import { debounce } from "../../common/util/debounce";
import { browseMediaPlayer, MediaPickedEvent } from "../../data/media-player";
import type { MediaPlayerItem } from "../../data/media-player";
import { installResizeObserver } from "../../panels/lovelace/common/install-resize-observer";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "../entity/ha-entity-picker";
import "../ha-button-menu";
import "../ha-card";
import "../ha-circular-progress";
import "../ha-paper-dropdown-menu";
import "../ha-svg-icon";

declare global {
  interface HASSDomEvents {
    "media-picked": MediaPickedEvent;
  }
}

@customElement("ha-media-player-browse")
export class HaMediaPlayerBrowse extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public entityId!: string;

  @property() public mediaContentId?: string;

  @property() public mediaContentType?: string;

  @property() public action: "pick" | "play" = "play";

  @property({ type: Boolean }) public hideBack = false;

  @property({ type: Boolean }) public hideTitle = false;

  @property({ type: Boolean }) public dialog = false;

  @property({ type: Boolean, attribute: "narrow", reflect: true })
  private _narrow = false;

  @internalProperty() private _loading = false;

  @internalProperty() private _mediaPlayerItems: MediaPlayerItem[] = [];

  private _resizeObserver?: ResizeObserver;

  public connectedCallback(): void {
    super.connectedCallback();
    this.updateComplete.then(() => this._attachObserver());
  }

  public disconnectedCallback(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
  }

  public navigateBack() {
    this._mediaPlayerItems!.pop();
    const item = this._mediaPlayerItems!.pop();
    if (!item) {
      return;
    }
    this._navigate(item);
  }

  protected render(): TemplateResult {
    if (!this._mediaPlayerItems.length) {
      return html``;
    }

    if (this._loading) {
      return html`<ha-circular-progress active></ha-circular-progress>`;
    }

    const mostRecentItem = this._mediaPlayerItems[
      this._mediaPlayerItems.length - 1
    ];
    const previousItem =
      this._mediaPlayerItems.length > 1
        ? this._mediaPlayerItems[this._mediaPlayerItems.length - 2]
        : undefined;

    const hasExpandableChildren:
      | MediaPlayerItem
      | undefined = this._hasExpandableChildren(mostRecentItem.children);

    const showImages = mostRecentItem.children?.some(
      (child) => child.thumbnail && child.thumbnail !== mostRecentItem.thumbnail
    );

    const mediaType = this.hass.localize(
      `ui.components.media-browser.content-type.${mostRecentItem.media_content_type}`
    );

    return html`
      <div
        class="header  ${classMap({
          "no-img": !mostRecentItem.thumbnail,
        })}"
      >
        <div class="header-content">
          ${mostRecentItem.thumbnail
            ? html`
                <div
                  class="img"
                  style="background-image: url(${mostRecentItem.thumbnail})"
                >
                  ${this._narrow && mostRecentItem?.can_play
                    ? html`
                        <mwc-fab
                          mini
                          .item=${mostRecentItem}
                          @click=${this._actionClicked}
                        >
                          <ha-svg-icon
                            slot="icon"
                            .label=${this.hass.localize(
                              `ui.components.media-browser.${this.action}-media`
                            )}
                            .path=${this.action === "play" ? mdiPlay : mdiPlus}
                          ></ha-svg-icon>
                          ${this.hass.localize(
                            `ui.components.media-browser.${this.action}`
                          )}
                        </mwc-fab>
                      `
                    : ""}
                </div>
              `
            : html``}
          <div class="header-info">
            ${this.hideTitle && (this._narrow || !mostRecentItem.thumbnail)
              ? ""
              : html`<div class="breadcrumb-overflow">
                  <div class="breadcrumb">
                    ${!this.hideBack && previousItem
                      ? html`
                          <div
                            class="previous-title"
                            @click=${this.navigateBack}
                          >
                            <ha-svg-icon .path=${mdiArrowLeft}></ha-svg-icon>
                            ${previousItem.title}
                          </div>
                        `
                      : ""}
                    <h1 class="title">${mostRecentItem.title}</h1>
                    ${mediaType
                      ? html`<h2 class="subtitle">
                          ${mediaType}
                        </h2>`
                      : ""}
                  </div>
                </div>`}
            ${mostRecentItem?.can_play &&
            (!mostRecentItem.thumbnail || !this._narrow)
              ? html`
                  <mwc-button
                    raised
                    .item=${mostRecentItem}
                    @click=${this._actionClicked}
                  >
                    <ha-svg-icon
                      slot="icon"
                      .label=${this.hass.localize(
                        `ui.components.media-browser.${this.action}-media`
                      )}
                      .path=${this.action === "play" ? mdiPlay : mdiPlus}
                    ></ha-svg-icon>
                    ${this.hass.localize(
                      `ui.components.media-browser.${this.action}`
                    )}
                  </mwc-button>
                `
              : ""}
          </div>
        </div>
        ${this.dialog
          ? html`
              <mwc-icon-button
                aria-label=${this.hass.localize("ui.dialogs.generic.close")}
                @click=${this._closeDialogAction}
                class="header_button"
                dir=${computeRTLDirection(this.hass)}
              >
                <ha-svg-icon path=${mdiClose}></ha-svg-icon>
              </mwc-icon-button>
            `
          : ""}
      </div>
      ${mostRecentItem.children?.length
        ? hasExpandableChildren
          ? html`
              <div class="children">
                ${mostRecentItem.children?.length
                  ? html`
                      ${mostRecentItem.children.map(
                        (child) => html`
                          <div
                            class="child"
                            .item=${child}
                            @click=${this._navigateForward}
                          >
                            <div class="ha-card-parent">
                              <ha-card
                                outlined
                                style="background-image: url(${child.thumbnail})"
                              >
                                ${child.can_expand && !child.thumbnail
                                  ? html`
                                      <ha-svg-icon
                                        class="folder"
                                        .path=${mdiFolder}
                                      ></ha-svg-icon>
                                    `
                                  : ""}
                              </ha-card>
                              ${child.can_play
                                ? html`
                                    <mwc-icon-button
                                      class="play"
                                      .item=${child}
                                      .label=${this.hass.localize(
                                        `ui.components.media-browser.${this.action}-media`
                                      )}
                                      @click=${this._actionClicked}
                                    >
                                      <ha-svg-icon
                                        .path=${this.action === "play"
                                          ? mdiPlay
                                          : mdiPlus}
                                      ></ha-svg-icon>
                                    </mwc-icon-button>
                                  `
                                : ""}
                            </div>
                            <div class="title">${child.title}</div>
                            <div class="type">
                              ${this.hass.localize(
                                `ui.components.media-browser.content-type.${child.media_content_type}`
                              )}
                            </div>
                          </div>
                        `
                      )}
                    `
                  : ""}
              </div>
            `
          : html`
              <mwc-list>
                ${mostRecentItem.children.map(
                  (child) => html`
                    <mwc-list-item
                      @click=${this._actionClicked}
                      .item=${child}
                      graphic="avatar"
                      hasMeta
                    >
                      <div
                        class="graphic"
                        style=${ifDefined(
                          showImages && child.thumbnail
                            ? `background-image: url(${child.thumbnail})`
                            : undefined
                        )}
                        slot="graphic"
                      >
                        <mwc-icon-button
                          class="play ${classMap({
                            show: !showImages || !child.thumbnail,
                          })}"
                          .item=${child}
                          .label=${this.hass.localize(
                            `ui.components.media-browser.${this.action}-media`
                          )}
                          @click=${this._actionClicked}
                        >
                          <ha-svg-icon
                            .path=${this.action === "play" ? mdiPlay : mdiPlus}
                          ></ha-svg-icon>
                        </mwc-icon-button>
                      </div>
                      <span>${child.title}</span>
                    </mwc-list-item>
                    <li divider role="separator"></li>
                  `
                )}
              </mwc-list>
            `
        : this.hass.localize("ui.components.media-browser.no_items")}
    `;
  }

  protected firstUpdated(): void {
    this._measureCard();
    this._attachObserver();

    this.addEventListener("scroll", this._scroll, { passive: true });
    this.addEventListener("touchmove", this._scroll, {
      passive: true,
    });
  }

  protected updated(changedProps: PropertyValues): void {
    super.updated(changedProps);

    if (
      !changedProps.has("entityId") &&
      !changedProps.has("mediaContentId") &&
      !changedProps.has("mediaContentType") &&
      !changedProps.has("action")
    ) {
      return;
    }

    this._fetchData(this.mediaContentId, this.mediaContentType).then(
      (itemData) => {
        this._mediaPlayerItems = [itemData];
      }
    );
  }

  private _actionClicked(ev: MouseEvent): void {
    ev.stopPropagation();
    const item = (ev.currentTarget as any).item;

    this._runAction(item);
  }

  private _runAction(item: MediaPlayerItem): void {
    fireEvent(this, "media-picked", {
      media_content_id: item.media_content_id,
      media_content_type: item.media_content_type,
    });
  }

  private async _navigateForward(ev: MouseEvent): Promise<void> {
    const target = ev.currentTarget as any;
    const item: MediaPlayerItem = target.item;

    if (!item) {
      return;
    }
    this._navigate(item);
  }

  private async _navigate(item: MediaPlayerItem) {
    const itemData = await this._fetchData(
      item.media_content_id,
      item.media_content_type
    );

    this.scrollTo(0, 0);
    this._mediaPlayerItems = [...this._mediaPlayerItems, itemData];
  }

  private async _fetchData(
    mediaContentId?: string,
    mediaContentType?: string
  ): Promise<MediaPlayerItem> {
    const itemData = await browseMediaPlayer(
      this.hass,
      this.entityId,
      !mediaContentId ? undefined : mediaContentId,
      mediaContentType
    );

    return itemData;
  }

  private _measureCard(): void {
    this._narrow = (this.dialog ? window.innerWidth : this.offsetWidth) < 450;
  }

  private _scroll(): void {
    if (this.scrollTop > (this._narrow ? 224 : 125)) {
      this.setAttribute("scroll", "");
    } else if (this.scrollTop === 0) {
      this.removeAttribute("scroll");
    }
  }

  private async _attachObserver(): Promise<void> {
    if (!this._resizeObserver) {
      await installResizeObserver();
      this._resizeObserver = new ResizeObserver(
        debounce(() => this._measureCard(), 250, false)
      );
    }

    this._resizeObserver.observe(this);
  }

  private _hasExpandableChildren = memoizeOne((children) =>
    children.find((item: MediaPlayerItem) => item.can_expand)
  );

  private _closeDialogAction(): void {
    fireEvent(this, "close-dialog");
  }

  static get styles(): CSSResultArray {
    return [
      haStyle,
      css`
        :host {
          display: block;
          overflow-y: auto;
          display: flex;
          padding: 0px 0px 20px;
          flex-direction: column;
        }

        .header {
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid var(--divider-color);
        }

        .header_button {
          position: relative;
          top: 14px;
          right: -8px;
        }

        .header {
          background-color: var(--card-background-color);
          position: sticky;
          top: 0;
          z-index: 5;
          padding: 20px 24px 10px;
        }

        .header-content {
          display: flex;
          flex-wrap: wrap;
          flex-grow: 1;
          align-items: flex-start;
        }

        .header-content .img {
          height: 200px;
          width: 200px;
          margin-right: 16px;
          background-size: cover;
          border-radius: 4px;
          transition: width 0.4s, height 0.4s;
        }

        .header-info {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-self: stretch;
          min-width: 0;
          flex: 1;
        }

        .header-info mwc-button {
          display: block;
        }

        .breadcrumb-overflow {
          display: flex;
          flex-grow: 1;
          justify-content: space-between;
        }

        .breadcrumb {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex-grow: 1;
        }

        .breadcrumb .title {
          font-size: 32px;
          line-height: 1.2;
          font-weight: bold;
          margin: 0;
          overflow: hidden;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          padding-right: 8px;
        }

        .breadcrumb .previous-title {
          font-size: 14px;
          padding-bottom: 8px;
          color: var(--secondary-text-color);
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
          --mdc-icon-size: 14px;
        }

        .breadcrumb .subtitle {
          font-size: 16px;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 0;
          transition: height 0.5s, margin 0.5s;
        }

        /* ============= CHILDREN ============= */

        mwc-list {
          --mdc-list-vertical-padding: 0;
          --mdc-theme-text-icon-on-background: var(--secondary-text-color);
          margin-top: 10px;
        }

        mwc-list li:last-child {
          display: none;
        }

        mwc-list li[divider] {
          border-bottom-color: var(--divider-color);
        }

        .children {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(var(--media-browse-item-size, 175px), 0.33fr)
          );
          grid-gap: 16px;
          margin: 8px 0px;
        }

        :host(:not([narrow])) .children {
          padding: 0px 24px;
        }

        .child {
          display: flex;
          flex-direction: column;
          cursor: pointer;
        }

        .ha-card-parent {
          position: relative;
          width: 100%;
        }

        ha-card {
          width: 100%;
          padding-bottom: 100%;
          position: relative;
          box-sizing: border-box;
          background-size: cover;
          background-repeat: no-repeat;
          background-position: center;
        }

        .child .folder,
        .child .play {
          position: absolute;
        }

        .child .folder {
          color: var(--secondary-text-color);
          top: calc(50% - (var(--mdc-icon-size) / 2));
          left: calc(50% - (var(--mdc-icon-size) / 2));
          --mdc-icon-size: calc(var(--media-browse-item-size, 175px) * 0.4);
        }

        .child .play {
          bottom: 4px;
          right: 4px;
          transition: all 0.5s;
          background-color: rgba(var(--rgb-card-background-color), 0.5);
          border-radius: 50%;
        }

        .child .play:hover {
          color: var(--primary-color);
        }

        ha-card:hover {
          opacity: 0.5;
        }

        .child .title {
          font-size: 16px;
          padding-top: 8px;
          overflow: hidden;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .child .type {
          font-size: 12px;
          color: var(--secondary-text-color);
        }

        mwc-list-item .graphic {
          background-size: cover;
        }

        mwc-list-item .graphic .play {
          opacity: 0;
          transition: all 0.5s;
          background-color: rgba(var(--rgb-card-background-color), 0.5);
          border-radius: 50%;
          --mdc-icon-button-size: 40px;
        }

        mwc-list-item:hover .graphic .play {
          opacity: 1;
          color: var(--primary-color);
        }

        mwc-list-item .graphic .play.show {
          opacity: 1;
          background-color: transparent;
        }

        /* ============= Narrow ============= */

        :host([narrow]) {
          padding: 0;
        }

        :host([narrow]) .breadcrumb .title {
          font-size: 24px;
        }

        :host([narrow]) .header {
          padding: 0;
        }

        :host([narrow]) .header_button {
          position: absolute;
          top: 14px;
          right: 8px;
        }

        :host([narrow]) .header-content {
          flex-direction: column;
          flex-wrap: nowrap;
        }

        :host([narrow]) .header-content .img {
          height: auto;
          width: 100%;
          margin-right: 0;
          padding-bottom: 50%;
          margin-bottom: 8px;
          position: relative;
          background-position: center;
          border-radius: 0;
          transition: width 0.4s, height 0.4s, padding-bottom 0.4s;
        }

        mwc-fab {
          position: absolute;
          --mdc-theme-secondary: var(--primary-color);
          bottom: -20px;
          right: 20px;
        }

        :host([narrow]) .header-info mwc-button {
          margin-top: 16px;
          margin-bottom: 8px;
        }

        :host([narrow]) .header-info {
          padding: 20px 24px 10px;
        }

        :host([narrow]) .media-source,
        :host([narrow]) .children {
          padding: 0 24px;
        }

        :host([narrow]) .children {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
        }

        /* ============= Scroll ============= */

        :host([scroll]) .breadcrumb .subtitle {
          height: 0;
          margin: 0;
        }

        :host([scroll]) .breadcrumb .title {
          -webkit-line-clamp: 1;
        }

        :host([scroll]) .header-info mwc-button,
        .no-img .header-info mwc-button {
          padding-right: 4px;
        }

        :host([scroll][narrow]) .no-img .header-info mwc-button {
          padding-right: 16px;
        }

        :host([scroll]) .header-info {
          flex-direction: row;
        }

        :host([scroll]) .header-info mwc-button {
          align-self: center;
          margin-top: 0;
          margin-bottom: 0;
        }

        :host([scroll][narrow]) .no-img .header-info {
          flex-direction: row-reverse;
        }

        :host([scroll][narrow]) .header-info {
          padding: 20px 24px 10px 24px;
          align-items: center;
        }

        :host([scroll]) .header-content {
          align-items: flex-end;
          flex-direction: row;
        }

        :host([scroll]) .header-content .img {
          height: 75px;
          width: 75px;
        }

        :host([scroll][narrow]) .header-content .img {
          height: 100px;
          width: 100px;
          padding-bottom: initial;
          margin-bottom: 0;
        }

        :host([scroll]) mwc-fab {
          bottom: 4px;
          right: 4px;
          --mdc-fab-box-shadow: none;
          --mdc-theme-secondary: rgba(var(--rgb-primary-color), 0.5);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-media-player-browse": HaMediaPlayerBrowse;
  }
}
