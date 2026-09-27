// antd v6 theme tokens — light (default) and dark.
//
// The accent is GU SEO's brand orange. antd has no separate token for a
// primary button's background — it paints it with `colorPrimary` — so
// that one value has to clear 4.5:1 against the white label text sitting
// on it, and again against the page ground, because the same colour is
// also the link and tab text. The blog's own #e05a2b is 3.71:1 on
// white; this set sits deeper in the same hue family to clear both.
//
// The status colours are deeper than the stock antd values on purpose.
// The stock green and amber land near 2:1 as 12px text on white, which
// is how a status label becomes invisible to exactly the people who most
// need to read it.
//
// These values mirror the CSS custom properties in styles/tokens.css. The
// vanilla cover editor is not themed by antd and reads those instead, so
// both files must change together. public/admin.css declares a third copy
// for the legacy standalone page — all three move together.

import { theme as antdTheme } from 'antd';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const lightTheme = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    // antd paints the primary button fill with colorPrimary directly — there
    // is no separate "button background" token — so this one value has to
    // clear 4.5:1 against white label text AND against the page ground it
    // may also be used as text on. #ab3d08 reaches 6.17:1 on a card and
    // 4.62:1 on the ground. The blog's #e05a2b is 3.71:1 on white and the
    // previous #c64a0c fell to 3.87:1 once the ground was tinted, so both
    // had to go deeper in the same hue family.
    colorPrimary: '#ab3d08',
    colorInfo: '#ab3d08',
    colorSuccess: '#12703a',
    colorWarning: '#9c4a06',
    colorError: '#b91c1c',
    colorLink: '#96330a',
    // The ground is now a tint, not white. A white container sitting on it
    // is what makes a Card read as raised — with both at #ffffff the card
    // was invisible and only a 1.09:1 hairline separated them.
    colorBgBase: '#ffffff',
    colorTextBase: '#0f1419',
    colorBgLayout: '#dae0df',
    colorBgContainer: '#ffffff',
    colorBorder: '#bcc2c1',
    colorBorderSecondary: '#e9edec',
    colorFillAlter: '#e9edec',
    // A field's own border, kept apart from colorBorder so it can clear
    // 3:1 (WCAG 1.4.11) without darkening every separator on the page.
    controlOutline: '#787e7e',
    fontFamily: FONT,
    fontSize: 14,
    borderRadius: 4,
    controlHeight: 32,
    boxShadow: 'none',
    boxShadowSecondary: '0 8px 24px rgba(15, 20, 25, 0.10), 0 1px 3px rgba(15, 20, 25, 0.06)',
  },
  components: {
    Layout: {
      siderBg: '#dae0df',
      headerBg: '#dae0df',
      bodyBg: '#dae0df',
    },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemHeight: 36,
      itemBorderRadius: 4,
      itemMarginInline: 8,
      itemMarginBlock: 1,
      iconSize: 15,
      itemColor: '#4d5761',
      itemHoverColor: '#0f1419',
      itemHoverBg: '#e9edec',
      itemSelectedColor: '#96330a',
      itemSelectedBg: '#fdf0e8',
    },
    Table: {
      headerBg: '#e9edec',
      headerColor: '#4d5761',
      headerSplitColor: 'transparent',
      rowHoverBg: '#eef2f1',
      borderColor: '#bcc2c1',
      headerBorderRadius: 0,
      cellPaddingBlock: 11,
      cellPaddingInline: 12,
      footerBg: '#ffffff',
    },
    Card: {
      headerBg: 'transparent',
      headerFontSize: 14,
      bodyPadding: 20,
      boxShadowTertiary: 'none',
      colorBorderSecondary: '#e9edec',
    },
    Button: {
      fontWeight: 500,
      defaultShadow: 'none',
      primaryShadow: 'none',
      dangerShadow: 'none',
      defaultBg: '#ffffff',
      // The default button's own edge, not a separator — see controlOutline.
      defaultBorderColor: '#787e7e',
      paddingInline: 14,
    },
    Input: {
      activeShadow: '0 0 0 2px rgba(15, 20, 25, 0.10)',
      colorBorder: '#787e7e',
      hoverBorderColor: '#96330a',
      activeBorderColor: '#ab3d08',
    },
    Select: {
      optionSelectedBg: '#fdf0e8',
      colorBorder: '#787e7e',
      optionItemBg: '#ffffff',
    },
    InputNumber: {
      colorBorder: '#787e7e',
      activeBorderColor: '#ab3d08',
    },
    DatePicker: {
      colorBorder: '#787e7e',
      activeBorderColor: '#ab3d08',
    },
    Tag: {
      defaultBg: '#f2f5f4',
      defaultColor: '#4d5761',
    },
    Statistic: {
      titleFontSize: 12,
      contentFontSize: 24,
    },
    Tabs: {
      titleFontSize: 14,
      itemColor: '#4d5761',
      itemActiveColor: '#96330a',
      itemHoverColor: '#ab3d08',
      itemSelectedColor: '#96330a',
      inkBarColor: '#ab3d08',
      horizontalItemGutter: 24,
    },
    Descriptions: {
      labelBg: '#e9edec',
      labelColor: '#4d5761',
      titleColor: '#0f1419',
    },
    Alert: {
      borderRadius: 4,
    },
    Steps: {
      colorSplit: '#9fa5a4',
    },
    Modal: {
      contentBg: '#ffffff',
      headerBg: '#ffffff',
    },
  },
};

export const darkTheme = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    // On a near-black surface the orange works as both fill and text, so
    // the primary button takes near-black label text (7.24:1) rather than
    // white, which would only reach 2.6:1 here.
    colorPrimary: '#ff7a33',
    colorInfo: '#ff7a33',
    colorSuccess: '#4ade80',
    colorWarning: '#fbbf24',
    colorError: '#f87171',
    colorLink: '#ff7a33',
    colorBgBase: '#0f1214',
    colorTextBase: '#e8ecee',
    colorBgLayout: '#0f1214',
    colorBgContainer: '#16191c',
    colorBorder: '#262b2f',
    colorBorderSecondary: '#1e2327',
    colorFillAlter: '#16191c',
    fontFamily: FONT,
    fontSize: 14,
    borderRadius: 4,
    controlHeight: 32,
    boxShadow: 'none',
    boxShadowSecondary: '0 8px 24px rgba(0, 0, 0, 0.55), 0 1px 3px rgba(0, 0, 0, 0.4)',
  },
  components: {
    Layout: {
      siderBg: '#0f1214',
      headerBg: '#0f1214',
      bodyBg: '#0f1214',
    },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemHeight: 36,
      itemBorderRadius: 4,
      itemMarginInline: 8,
      itemMarginBlock: 1,
      iconSize: 15,
      itemColor: '#9aa4ad',
      itemHoverColor: '#e8ecee',
      itemHoverBg: '#16191c',
      itemSelectedColor: '#ff7a33',
      itemSelectedBg: '#2a1a12',
    },
    Table: {
      headerBg: '#16191c',
      headerColor: '#9aa4ad',
      headerSplitColor: 'transparent',
      rowHoverBg: '#16191c',
      borderColor: '#262b2f',
      headerBorderRadius: 0,
      cellPaddingBlock: 11,
      cellPaddingInline: 12,
      footerBg: '#16191c',
    },
    Card: {
      headerBg: 'transparent',
      headerFontSize: 14,
      bodyPadding: 20,
      boxShadowTertiary: 'none',
    },
    Button: {
      fontWeight: 500,
      defaultShadow: 'none',
      primaryShadow: 'none',
      dangerShadow: 'none',
      defaultBg: '#16191c',
      defaultBorderColor: '#3a4147',
      paddingInline: 14,
    },
    Input: {
      activeShadow: '0 0 0 2px rgba(255, 255, 255, 0.12)',
    },
    Select: {
      optionSelectedBg: '#2a1a12',
    },
    Tag: {
      defaultBg: '#1e2327',
      defaultColor: '#9aa4ad',
    },
    Statistic: {
      titleFontSize: 12,
      contentFontSize: 24,
    },
    Tabs: {
      titleFontSize: 14,
      itemColor: '#9aa4ad',
      itemActiveColor: '#ff7a33',
      itemHoverColor: '#e8ecee',
      itemSelectedColor: '#ff7a33',
      inkBarColor: '#ff7a33',
      horizontalItemGutter: 24,
    },
    Descriptions: {
      labelBg: '#16191c',
      labelColor: '#9aa4ad',
      titleColor: '#e8ecee',
    },
    Alert: {
      borderRadius: 4,
    },
    Steps: {
      colorSplit: '#3a4147',
    },
    Modal: {
      contentBg: '#16191c',
      headerBg: '#16191c',
    },
  },
};
