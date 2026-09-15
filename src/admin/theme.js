// antd v6 theme tokens — light (default) and dark.
// Mirrors the Ant Design Pro v6 Light palette from the previous CSS work.

import { theme as antdTheme } from 'antd';

export const lightTheme = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#1677ff',
    colorBgBase: '#ffffff',
    colorTextBase: '#000000',
    colorBgLayout: '#f5f5f5',
    colorBgContainer: '#ffffff',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontSize: 14,
    borderRadius: 8,
    controlHeight: 36,
    boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03), 0 1px 6px -1px rgba(0,0,0,0.02), 0 2px 4px 0 rgba(0,0,0,0.02)',
    boxShadowSecondary: '0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -4px rgba(0,0,0,0.12), 0 9px 28px 8px rgba(0,0,0,0.05)',
  },
  components: {
    Layout: {
      siderBg: '#ffffff',
      headerBg: '#ffffff',
      bodyBg: '#f5f5f5',
    },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemSelectedBg: '#e6f4ff',
      itemSelectedColor: '#1677ff',
      itemHoverBg: '#f5f5f5',
      itemHeight: 40,
      iconSize: 16,
    },
    Card: {
      boxShadowTertiary: '0 1px 2px 0 rgba(0,0,0,0.03)',
    },
    Table: {
      headerBg: '#fafafa',
      headerColor: '#000000e0',
      rowHoverBg: '#f5f5f5',
    },
  },
};

export const darkTheme = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: '#1668dc',
    colorBgBase: '#141414',
    colorTextBase: '#ffffff',
    colorBgLayout: '#0a0a0a',
    colorBgContainer: '#1f1f1f',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontSize: 14,
    borderRadius: 8,
    controlHeight: 36,
  },
  components: {
    Layout: {
      siderBg: '#1f1f1f',
      headerBg: '#1f1f1f',
      bodyBg: '#0a0a0a',
    },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemSelectedBg: 'rgba(22,104,220,0.15)',
      itemSelectedColor: '#1668dc',
      itemHoverBg: 'rgba(255,255,255,0.04)',
    },
    Card: {
      boxShadowTertiary: 'none',
    },
    Table: {
      headerBg: '#1f1f1f',
      rowHoverBg: 'rgba(255,255,255,0.04)',
    },
  },
};
