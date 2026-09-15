// Admin app shell — antd v6 Layout with Sider + Menu + Content.
// Hash-based routing (#overview, #blog, etc.) — same as vanilla admin.

import { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { Layout, Menu, Avatar, Dropdown, Button, Space, Select, Badge, Skeleton, Result, ConfigProvider, App as AntApp, Form, Input, Card, Tabs, Alert, message } from 'antd';
import {
  AppstoreOutlined, FileTextOutlined, GiftOutlined, BarChartOutlined,
  GlobalOutlined, DashboardOutlined, SettingOutlined, TeamOutlined,
  ProjectOutlined, SafetyOutlined, SyncOutlined, SunOutlined, MoonOutlined,
  LogoutOutlined, LockOutlined, BellOutlined, CheckCircleOutlined,
  CalendarOutlined, RiseOutlined, PictureOutlined, LinkOutlined,
  CodeOutlined, RocketOutlined, ApiOutlined, SendOutlined,
} from '@ant-design/icons';
import { lightTheme, darkTheme } from './theme.js';
import { useTheme, useAuth, AuthProvider, useProjects, ProjectsProvider } from './hooks/useTheme.jsx';
import { setActiveProject, apiPost, api, apiGet } from './api.js';
import OnboardingWizard from './components/SetupWizard.jsx';

const { Sider, Header, Content } = Layout;

// Lazy-load pages so the initial bundle stays small.
const OverviewPage = lazy(() => import('./pages/Overview.jsx'));
const BlogPage = lazy(() => import('./pages/Blog.jsx'));
const CalendarPage = lazy(() => import('./pages/Calendar.jsx'));
const TrendsPage = lazy(() => import('./pages/Trends.jsx'));
const BrandPage = lazy(() => import('./pages/Brand.jsx'));
const CoversPage = lazy(() => import('./pages/Covers.jsx'));
const ProgPage = lazy(() => import('./pages/Prog.jsx'));
const LinksPage = lazy(() => import('./pages/Links.jsx'));
const AnalyticsPage = lazy(() => import('./pages/Analytics.jsx'));
const SeoPage = lazy(() => import('./pages/Seo.jsx'));
const EmbedsPage = lazy(() => import('./pages/Embeds.jsx'));
const PublishingPage = lazy(() => import('./pages/Publishing.jsx'));
const SocialPage = lazy(() => import('./pages/Social.jsx'));
const InsightsPage = lazy(() => import('./pages/Insights.jsx'));
const StatusPage = lazy(() => import('./pages/Status.jsx'));
const UpdatesPage = lazy(() => import('./pages/Updates.jsx'));
const UsagePage = lazy(() => import('./pages/Usage.jsx'));
const SettingsPage = lazy(() => import('./pages/Settings.jsx'));
const UsersPage = lazy(() => import('./pages/Users.jsx'));
const ProjectsPage = lazy(() => import('./pages/Projects.jsx'));

// Menu structure — mirrors the old data-children hierarchy.
const MENU_ITEMS = [
  { key: 'overview', icon: <AppstoreOutlined />, label: 'Tổng quan' },
  {
    key: 'content', icon: <FileTextOutlined />, label: 'Bài viết',
    children: [
      { key: 'blog', icon: <FileTextOutlined />, label: 'Blog' },
      { key: 'calendar', icon: <CalendarOutlined />, label: 'Lịch nội dung' },
      { key: 'trends', icon: <RiseOutlined />, label: 'Xu hướng' },
    ],
  },
  {
    key: 'brand', icon: <GiftOutlined />, label: 'Thương hiệu',
    children: [
      { key: 'brand', icon: <GiftOutlined />, label: 'Brand DNA' },
      { key: 'covers', icon: <PictureOutlined />, label: 'Cover Editor' },
      { key: 'prog', icon: <ProjectOutlined />, label: 'Programmatic SEO' },
      { key: 'links', icon: <LinkOutlined />, label: 'Internal Links' },
    ],
  },
  { key: 'analytics', icon: <BarChartOutlined />, label: 'Phân tích' },
  {
    key: 'distribution', icon: <GlobalOutlined />, label: 'Phân phối',
    children: [
      { key: 'seo', icon: <GlobalOutlined />, label: 'SEO & IndexNow' },
      { key: 'embeds', icon: <CodeOutlined />, label: 'Embeds' },
      { key: 'publishing', icon: <ApiOutlined />, label: 'Kênh xuất bản' },
      { key: 'social', icon: <SendOutlined />, label: 'Bài đăng mạng xã hội' },
    ],
  },
  {
    key: 'system', icon: <SafetyOutlined />, label: 'Hệ thống',
    children: [
      { key: 'status', icon: <DashboardOutlined />, label: 'Trạng thái' },
      { key: 'updates', icon: <SyncOutlined />, label: 'Cập nhật' },
      { key: 'usage', icon: <BarChartOutlined />, label: 'Sử dụng' },
      { key: 'insights', icon: <RiseOutlined />, label: 'Tăng trưởng' },
    ],
  },
  { key: 'settings', icon: <SettingOutlined />, label: 'Cài đặt' },
  { key: 'users', icon: <TeamOutlined />, label: 'Người dùng' },
  { key: 'projects', icon: <ProjectOutlined />, label: 'Dự án' },
];

// Map page keys to lazy components.
const PAGE_COMPONENTS = {
  overview: OverviewPage, blog: BlogPage, calendar: CalendarPage,
  trends: TrendsPage, brand: BrandPage, covers: CoversPage,
  prog: ProgPage, links: LinksPage, analytics: AnalyticsPage,
  seo: SeoPage, embeds: EmbedsPage, publishing: PublishingPage, social: SocialPage, status: StatusPage,
  insights: InsightsPage,
  updates: UpdatesPage, usage: UsagePage, settings: SettingsPage,
  users: UsersPage, projects: ProjectsPage,
};

// Pages hidden from project_admin (non-super_admin) users.
// Mirrors SUPER_ADMIN_ONLY_TABS + PROJECT_ADMIN_HIDDEN_PAGES from admin.js.
const SUPER_ADMIN_ONLY = new Set(['settings', 'users', 'projects', 'status', 'updates', 'usage', 'insights']);

function filterMenuByRole(items, role) {
  const isSuper = role === 'super_admin';
  return items
    .filter((item) => isSuper || !SUPER_ADMIN_ONLY.has(item.key))
    .map((item) => {
      if (!item.children) return item;
      const children = item.children.filter((c) => isSuper || !SUPER_ADMIN_ONLY.has(c.key));
      return { ...item, children };
    })
    .filter((item) => !item.children || item.children.length > 0);
}

function AdminShell() {
  const { theme, toggle } = useTheme();
  const { user, loading, needsSetup, logout, check } = useAuth();
  const { projects, activeProject, switchProject, load: loadProjects } = useProjects();
  const [collapsed, setCollapsed] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [current, setCurrent] = useState(() => {
    const h = window.location.hash.replace(/^#/, '').trim();
    return h || 'overview';
  });

  // Sync hash → state
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace(/^#/, '').trim();
      if (h) setCurrent(h);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Sync state → hash
  const navigate = useCallback((key) => {
    setCurrent(key);
    if (window.location.hash !== '#' + key) {
      window.location.hash = key;
    }
  }, []);

  // Projects are auto-loaded by ProjectsProvider once authenticated.

  // Auto-open wizard for new users (onboarding not complete)
  useEffect(() => {
    if (!user) return;
    apiGet('/api/admin/onboarding').then(({ status, body }) => {
      if (status === 200 && body?.ok && !body.complete) {
        setWizardOpen(true);
      }
    }).catch(() => {});
  }, [user]);

  // Propagate active project to API client
  useEffect(() => {
    if (activeProject) setActiveProject(activeProject.id);
  }, [activeProject]);

  // Filter menu by role
  const visibleMenu = useMemo(() => filterMenuByRole(MENU_ITEMS, user?.role), [user?.role]);

  // Find the top-level parent key for openKeys — must be before any early returns
  const openKeys = useMemo(() => {
    for (const item of visibleMenu) {
      if (item.key === current) return [];
      if (item.children?.some((c) => c.key === current)) return [item.key];
    }
    return [];
  }, [current, visibleMenu]);

  // Show login gate if not authenticated
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </div>
    );
  }
  if (needsSetup) {
    return <SetupWizard onDone={() => check()} />;
  }
  if (!user) {
    return <LoginGate />;
  }

  // If current page is blocked for this role, redirect to overview
  if (user.role !== 'super_admin' && SUPER_ADMIN_ONLY.has(current)) {
    navigate('overview');
  }

  const PageComponent = PAGE_COMPONENTS[current] || OverviewPage;

  const userMenu = {
    items: [
      { key: 'profile', label: user?.email, disabled: true },
      { type: 'divider' },
      { key: 'logout', label: 'Đăng xuất', icon: <LogoutOutlined /> },
    ],
    onClick: ({ key }) => { if (key === 'logout') logout(); },
  };

  return (
    <ConfigProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
      <AntApp>
        <Layout style={{ minHeight: '100vh' }}>
          <Sider
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            width={240}
            breakpoint="lg"
            style={{ overflow: 'auto', height: '100vh', position: 'sticky', top: 0, borderRight: '1px solid rgba(0,0,0,0.06)' }}
          >
            <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
              <img src="/logo-guseo-sm.png" alt="GU SEO" style={{ height: 28, width: 'auto' }} />
              {!collapsed && <span style={{ marginLeft: 10, fontWeight: 700, fontSize: 16 }}>GU SEO</span>}
            </div>
            <Menu
              mode="inline"
              selectedKeys={[current]}
              defaultOpenKeys={openKeys}
              onClick={({ key }) => navigate(key)}
              items={visibleMenu}
              style={{ borderRight: 0 }}
            />
          </Sider>

          <Layout>
            <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <Space size="middle">
                {user?.role === 'super_admin' && projects.length > 0 && (
                  <Select
                    value={activeProject?.id}
                    onChange={switchProject}
                    style={{ width: 200 }}
                    options={projects.map((p) => ({ value: p.id, label: p.site_name || p.slug }))}
                  />
                )}
                {user?.role !== 'super_admin' && activeProject && (
                  <Badge count={activeProject.site_name || activeProject.slug} style={{ backgroundColor: '#1677ff' }} />
                )}
                {user?.role === 'super_admin' && <Badge count="Quản trị hệ thống" style={{ backgroundColor: '#52c41a' }} />}
                {user?.role !== 'super_admin' && user?.plan_tier === 'free' && (
                  <Badge count={`Free · ${user?.post_count || 0}/${user?.post_limit || 100} bài`} style={{ backgroundColor: '#faad14' }} />
                )}
              </Space>
              <Space size="small">
                <Button icon={<RocketOutlined />} onClick={() => setWizardOpen(true)}>Trình thiết lập</Button>
                <Button type="text" icon={theme === 'dark' ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} />
                <Dropdown menu={userMenu} placement="bottomRight">
                  <Space style={{ cursor: 'pointer' }}>
                    <Avatar size="small" style={{ backgroundColor: '#1677ff' }}>
                      {user?.email?.[0]?.toUpperCase() || 'A'}
                    </Avatar>
                    {!collapsed && <span style={{ fontSize: 13 }}>{user?.email}</span>}
                  </Space>
                </Dropdown>
              </Space>
            </Header>

            <Content style={{ padding: 24, overflow: 'auto' }}>
              <Suspense fallback={<Skeleton active paragraph={{ rows: 6 }} />}>
                <PageComponent />
              </Suspense>
            </Content>
          </Layout>
        </Layout>
        <OnboardingWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onComplete={() => { check(); loadProjects(); }} />
      </AntApp>
    </ConfigProvider>
  );
}

// Login gate — shown when not authenticated. Has login + register tabs.
function LoginGate() {
  const { login, check } = useAuth();
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [regForm] = Form.useForm();

  useEffect(() => {
    if (window.location.hash === '#register') setTab('register');
  }, []);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const t = setTimeout(() => setOtpCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCooldown]);

  const onLogin = async (values) => {
    setLoading(true);
    setError(null);
    const res = await login(values.email, values.password);
    if (!res.ok) setError(res.error);
    setLoading(false);
  };

  const sendOtp = async () => {
    const email = regForm.getFieldValue('email');
    const brand = regForm.getFieldValue('brand');
    if (!email || !email.includes('@')) { setError('Nhập email hợp lệ trước khi gửi OTP'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/public/send-otp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), brand_name: brand || 'GU SEO' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        message.success(`Đã gửi mã OTP tới ${email}`);
        setOtpCooldown(60);
      } else {
        setError(data.detail || data.error || 'Không thể gửi OTP');
      }
    } catch (e) {
      setError('Lỗi kết nối: ' + e.message);
    }
    setLoading(false);
  };

  const onRegister = async (values) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/public/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brand_name: values.brand,
          website_url: values.website,
          email: values.email.trim().toLowerCase(),
          password: values.password,
          otp: values.otp,
        }),
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        message.success('Tài khoản đã tạo. Đang đăng nhập...');
        await check();
      } else {
        setError(data.detail || data.error || 'Đăng ký thất bại');
      }
    } catch (e) {
      setError('Lỗi kết nối: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <ConfigProvider theme={lightTheme}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
        <div style={{ width: 420, maxWidth: '90vw' }}>
          <Card>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <img src="/logo-guseo.png" alt="GU SEO" style={{ height: 48, marginBottom: 12 }} />
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>GU SEO Console</h2>
              <p style={{ color: '#00000073', marginTop: 8, fontSize: 13 }}>Đăng nhập hoặc đăng ký dùng thử 100 bài viết SEO</p>
            </div>

            <Tabs
              activeKey={tab}
              onChange={(k) => { setTab(k); setError(null); }}
              centered
              items={[
                {
                  key: 'login',
                  label: 'Đăng nhập',
                  children: (
                    <Form layout="vertical" onFinish={onLogin} requiredMark={false}>
                      <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Nhập email hợp lệ' }]}>
                        <Input placeholder="name@company.com" autoComplete="username" />
                      </Form.Item>
                      <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
                        <Input.Password placeholder="Nhập mật khẩu" autoComplete="current-password" />
                      </Form.Item>
                      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />}
                      <Button type="primary" htmlType="submit" block loading={loading}>Đăng nhập</Button>
                    </Form>
                  ),
                },
                {
                  key: 'register',
                  label: 'Đăng ký (Free 100 bài)',
                  children: (
                    <Form form={regForm} layout="vertical" onFinish={onRegister} requiredMark={false}>
                      <Form.Item name="brand" label="Tên thương hiệu / Website" rules={[{ required: true, message: 'Nhập tên thương hiệu' }]}>
                        <Input placeholder="My Shop, Tech Blog..." maxLength={80} />
                      </Form.Item>
                      <Form.Item name="website" label="Website (tùy chọn)">
                        <Input placeholder="https://example.com" type="url" />
                      </Form.Item>
                      <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Nhập email hợp lệ' }]}>
                        <Input placeholder="you@example.com" autoComplete="username" />
                      </Form.Item>
                      <Form.Item name="otp" label="Mã OTP (6 số)" rules={[{ required: true, len: 6, message: 'Nhập mã OTP 6 số' }]}>
                        <Space.Compact style={{ width: '100%' }}>
                          <Input placeholder="6 chữ số OTP" maxLength={6} style={{ fontFamily: 'monospace', letterSpacing: 4, fontWeight: 700 }} autoComplete="one-time-code" />
                          <Button onClick={sendOtp} disabled={otpCooldown > 0 || loading}>
                            {otpCooldown > 0 ? `Gửi lại (${otpCooldown}s)` : 'Gửi OTP'}
                          </Button>
                        </Space.Compact>
                      </Form.Item>
                      <Form.Item name="password" label="Mật khẩu (tối thiểu 8 ký tự)" rules={[{ required: true, min: 8, message: 'Mật khẩu tối thiểu 8 ký tự' }]}>
                        <Input.Password placeholder="••••••••" autoComplete="new-password" />
                      </Form.Item>
                      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />}
                      <Button type="primary" htmlType="submit" block loading={loading}>Xác thực OTP & Tạo tài khoản</Button>
                    </Form>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>
    </ConfigProvider>
  );
}

// Setup wizard — shown on fresh deploy when no admin user exists yet.
function SetupWizard({ onDone }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = async (values) => {
    setLoading(true);
    setError(null);
    try {
      const { status, body } = await api('/api/setup', {
        method: 'POST',
        body: JSON.stringify({
          site_name: values.site_name,
          site_url: values.site_url,
          email: values.email.trim().toLowerCase(),
          password: values.password,
        }),
      });
      if (status === 200 && body?.ok) {
        setSuccess(true);
        setTimeout(() => onDone(), 1500);
      } else {
        setError(body?.error || body?.detail || 'Thiết lập thất bại');
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <ConfigProvider theme={lightTheme}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
          <Card style={{ textAlign: 'center', width: 400 }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
            <h2 style={{ marginBottom: 8 }}>Hoàn tất!</h2>
            <p style={{ color: '#00000073' }}>Tài khoản quản trị đã sẵn sàng. Đang đăng nhập...</p>
          </Card>
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={lightTheme}>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
        <div style={{ width: 460, maxWidth: '90vw' }}>
          <Card>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <img src="/logo-guseo.png" alt="GU SEO" style={{ height: 48, marginBottom: 12 }} />
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Thiết lập ban đầu</h2>
              <p style={{ color: '#00000073', marginTop: 8, fontSize: 13 }}>
                Đây là bản triển khai mới. Chọn email, mật khẩu và website của bạn — phần còn lại chúng tôi lo.
              </p>
            </div>
            <Form form={form} layout="vertical" onFinish={onSubmit}>
              <Form.Item name="site_name" label="Tên website" rules={[{ required: true }]}>
                <Input placeholder="Trang web của tôi" maxLength={80} />
              </Form.Item>
              <Form.Item name="site_url" label="URL website" rules={[{ required: true, type: 'url' }]}>
                <Input placeholder="https://example.com" autoComplete="url" />
              </Form.Item>
              <Form.Item name="email" label="Email quản trị" rules={[{ required: true, type: 'email' }]}>
                <Input placeholder="you@example.com" autoComplete="username" />
              </Form.Item>
              <Form.Item name="password" label="Mật khẩu (từ 8 ký tự)" rules={[{ required: true, min: 8 }]}>
                <Input.Password placeholder="••••••••" autoComplete="new-password" maxLength={256} />
              </Form.Item>
              {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} closable onClose={() => setError(null)} />}
              <Button type="primary" htmlType="submit" block loading={loading}>Hoàn tất thiết lập</Button>
            </Form>
            <p style={{ textAlign: 'center', color: '#00000045', fontSize: 12, marginTop: 16 }}>
              Bước này chỉ chạy một lần. Sau khi xong, bạn sẽ đăng nhập bình thường.
            </p>
          </Card>
        </div>
      </div>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProjectsProvider>
        <AdminShell />
      </ProjectsProvider>
    </AuthProvider>
  );
}
