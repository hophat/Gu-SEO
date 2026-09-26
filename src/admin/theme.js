// antd v6 theme tokens — light (default) and dark.
//
// The system is achromatic on purpose: the accent is near-black in light
// mode and pure white in dark mode, the way the operator surfaces this
// product grew up on. Depth comes from 1px hairline borders, not shadows.
// The one exception is `boxShadowSecondary`, which stays because overlays
// (Dropdown, Modal, Drawer, Tooltip) float above the page and have no
// border to separate them.
//
// These values mirror the CSS custom properties in styles/tokens.css. The
// vanilla cover editor is not themed by antd and reads those instead, so
// both files must change together.

import { theme as antdTheme } from 'antd';

const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const lightTheme = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#0f1419',
    colorInfo: '#0f1419',
    colorSuccess: '#15803d',
    colorWarning: '#b45309',
    colorError: '#b91c1c',
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
      itemSelectedColor: '#0f1419',
      itemSelectedBg: '#eff1f1',
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
      optionSelectedBg: '#eff1f1',
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
      itemActiveColor: '#0f1419',
      itemHoverColor: '#0f1419',
      itemSelectedColor: '#0f1419',
      inkBarColor: '#0f1419',
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
    colorPrimary: '#ffffff',
    colorInfo: '#ffffff',
    colorSuccess: '#4ade80',
    colorWarning: '#fbbf24',
    colorError: '#f87171',
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
      itemSelectedColor: '#ffffff',
      itemSelectedBg: '#1e2327',
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
      optionSelectedBg: '#1e2327',
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
      itemActiveColor: '#ffffff',
      itemHoverColor: '#e8ecee',
      itemSelectedColor: '#ffffff',
      inkBarColor: '#ffffff',
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
