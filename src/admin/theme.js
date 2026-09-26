// antd v6 theme tokens — light (default) and dark.
//
// The accent is GU SEO's brand orange. antd has no separate token for a
// primary button's background — it paints it with `colorPrimary` — so
// that one value has to clear 4.5:1 against the white label text sitting
// on it. #c64a0c reaches 4.79:1 and doubles as the link and chip-text
// colour. The blog's own #e05a2b is only 3.71:1 on white: fine as a
// large decorative fill, not fine as text, so this set sits a little
// deeper in the same hue family.
//
// The status colours are deeper than the stock antd values on purpose.
// The stock green and amber land near 2:1 as 12px text on white, which
// is how a status label becomes invisible to exactly the people who most
// need to read it.
//
// These values mirror the CSS custom properties in styles/tokens.css. The
// vanilla cover editor is not themed by antd and reads those instead, so
// both files must change together.

import { theme as antdTheme } from 'antd';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const lightTheme = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    // antd paints the primary button fill with colorPrimary directly — there
    // is no separate "button background" token — so this one value has to
    // clear 4.5:1 against white label text. #c64a0c reaches 4.79:1, and it
    // also serves as the link and chip-text colour, where it is legal.
    colorPrimary: '#c64a0c',
    colorInfo: '#c64a0c',
    colorSuccess: '#12703a',
    colorWarning: '#a34a07',
    colorError: '#b91c1c',
    colorLink: '#b8430a',
    colorBgBase: '#ffffff',
    colorTextBase: '#0f1419',
    colorBgLayout: '#ffffff',
    colorBgContainer: '#ffffff',
    colorBorder: '#e7e9ea',
    colorBorderSecondary: '#f0f2f3',
    colorFillAlter: '#f7f9f8',
    fontFamily: FONT,
    fontSize: 14,
    borderRadius: 4,
    controlHeight: 32,
    boxShadow: 'none',
    boxShadowSecondary: '0 8px 24px rgba(15, 20, 25, 0.10), 0 1px 3px rgba(15, 20, 25, 0.06)',
  },
  components: {
    Layout: {
      siderBg: '#ffffff',
      headerBg: '#ffffff',
      bodyBg: '#ffffff',
    },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemHeight: 36,
      itemBorderRadius: 4,
      itemMarginInline: 8,
      itemMarginBlock: 1,
      iconSize: 15,
      itemColor: '#5b6570',
      itemHoverColor: '#0f1419',
      itemHoverBg: '#f7f9f8',
      itemSelectedColor: '#b8430a',
      itemSelectedBg: '#fff4ef',
    },
    Table: {
      headerBg: '#f7f9f8',
      headerColor: '#5b6570',
      headerSplitColor: 'transparent',
      rowHoverBg: '#f7f9f8',
      borderColor: '#e7e9ea',
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
    },
    Button: {
      fontWeight: 500,
      defaultShadow: 'none',
      primaryShadow: 'none',
      dangerShadow: 'none',
      defaultBg: '#ffffff',
      defaultBorderColor: '#d0d5d8',
      paddingInline: 14,
    },
    Input: {
      activeShadow: '0 0 0 2px rgba(15, 20, 25, 0.10)',
    },
    Select: {
      optionSelectedBg: '#fff4ef',
    },
    Tag: {
      defaultBg: '#f2f4f4',
      defaultColor: '#5b6570',
    },
    Statistic: {
      titleFontSize: 12,
      contentFontSize: 24,
    },
    Tabs: {
      titleFontSize: 14,
      itemColor: '#5b6570',
      itemActiveColor: '#b8430a',
      itemHoverColor: '#c64a0c',
      itemSelectedColor: '#b8430a',
      inkBarColor: '#c64a0c',
      horizontalItemGutter: 24,
    },
    Descriptions: {
      labelBg: '#f7f9f8',
      labelColor: '#5b6570',
      titleColor: '#0f1419',
    },
    Alert: {
      borderRadius: 4,
    },
    Steps: {
      colorSplit: '#d0d5d8',
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
