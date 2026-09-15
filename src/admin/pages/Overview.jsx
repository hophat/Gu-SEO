// Overview page — antd Statistic, Card, Progress, Row/Col, Button, Tag, Input, Alert, Collapse.
import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Progress, Button, Tag, Input, Alert, Space, Typography, Skeleton, message, Popconfirm, Tooltip, Collapse, Badge, Avatar, Descriptions, Divider } from 'antd';
import { FileTextOutlined, AppstoreOutlined, ClockCircleOutlined, PlusOutlined, GlobalOutlined, DeleteOutlined, SaveOutlined, InfoCircleOutlined, ThunderboltOutlined, LinkOutlined, CheckCircleOutlined, QuestionCircleOutlined, CloudOutlined, ShopOutlined, EnvironmentOutlined, CalendarOutlined, RocketOutlined, EditOutlined, SendOutlined, WarningOutlined } from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet, apiPost } from '../api.js';
import { useAuth, useProjects } from '../hooks/useTheme.jsx';
import { useProjectUrl } from '../lib/projectUrl.js';

const { Text, Link, Paragraph } = Typography;

// Collapse a long AI-generated blurb to a single readable line. Cuts on
// a word boundary so we don't chop mid-word, and appends an ellipsis.
function shorten(s, n = 64) {
  const t = String(s || '').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.55 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

// Split the newline-separated brand key_themes into a short tag list.
function themeList(s, max = 4) {
  return String(s || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, max);
}

// projectUrl() returns a root-relative path on the shared host
// (e.g. "/gurouter/blog") and an absolute URL on a custom domain.
// Turn the former into something clickable/copyable for display.
function absoluteUrl(u) {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  return window.location.origin + u;
}

export default function Overview() {
  const { user } = useAuth();
  const { activeProject } = useProjects();
  const { projectUrl } = useProjectUrl();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ published: 0, prog: 0, queue: 0 });
  const [quota, setQuota] = useState({ plan: 'free', used: 0, limit: 100, isSuper: false });
  const [domain, setDomain] = useState({ current: '', target: 'gu-seo.pages.dev', input: '' });
  const [domainMsg, setDomainMsg] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [calendar, setCalendar] = useState({ total: 0, scheduled: 0, published: 0, today: 0, nextDate: null });
  const [brand, setBrand] = useState(null);
  const [social, setSocial] = useState({ jobs: [], counts: {} });
  const [attention, setAttention] = useState({ items: [], counts: {} });
  const [activation, setActivation] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const [posts, prog, queue, who, cal, brandRes, socialRes, attentionRes, activationRes] = await Promise.all([
      apiGet('/api/admin/blog/list'),
      apiGet('/api/admin/prog/queue?status=done&limit=500'),
      apiGet('/api/admin/prog/queue?status=pending&limit=500'),
      apiGet('/api/admin/whoami'),
      apiGet(`/api/admin/calendar?from=${from}&to=${to}`),
      apiGet('/api/admin/brand-dna'),
      apiGet('/api/admin/social?limit=200'),
      apiGet('/api/admin/attention'),
      apiGet('/api/admin/activation'),
    ]);
    const published = (posts.body?.posts || []).filter((p) => p.status === 'published').length;
    setStats({ published, prog: prog.body?.keywords?.length || 0, queue: queue.body?.keywords?.length || 0 });

    const info = who.body || {};
    const isSuper = info.role === 'super_admin';
    setQuota({
      plan: isSuper ? 'super' : 'free',
      used: published,
      limit: info.post_limit || 100,
      isSuper,
    });

    // Calendar stats
    const slots = cal.body?.slots || [];
    const scheduledCount = slots.filter((s) => s.status === 'scheduled').length;
    const publishedCount = slots.filter((s) => s.status === 'published').length;
    const todaySlots = slots.filter((s) => s.scheduled_for === today);
    const upcoming = slots.filter((s) => s.scheduled_for >= today && s.status !== 'published').sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
    setCalendar({
      total: slots.length,
      scheduled: scheduledCount,
      published: publishedCount,
      today: todaySlots.length,
      nextDate: upcoming[0]?.scheduled_for || null,
    });

    // Brand DNA
    if (brandRes.status === 200 && brandRes.body?.brand) {
      setBrand(brandRes.body.brand);
    }

    // Social distribution
    if (socialRes.status === 200 && socialRes.body?.ok) {
      setSocial({
        jobs: socialRes.body.jobs || [],
        counts: socialRes.body.counts || {},
      });
    }

    // Action center + activation checklist
    if (attentionRes.status === 200 && attentionRes.body?.ok) {
      setAttention({ items: attentionRes.body.items || [], counts: attentionRes.body.counts || {} });
    }
    if (activationRes.status === 200 && activationRes.body?.ok) {
      setActivation(activationRes.body);
    }

    // Domain
    const dres = await apiGet('/api/admin/projects/domain');
    if (dres.status === 200 && dres.body?.ok) {
      setDomain({ current: dres.body.custom_domain || '', target: dres.body.cname_target || 'gu-seo.pages.dev', input: dres.body.custom_domain || '', cfManaged: dres.body.cf_managed !== false, cfAttached: !!dres.body.cf_attached, cfStatus: dres.body.cf_status || '' });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveDomain = async (remove) => {
    const val = remove ? '' : domain.input.trim();
    if (!remove && !val) { setDomainMsg({ type: 'error', text: 'Vui lòng nhập tên miền.' }); return; }
    setDomainMsg({ type: 'info', text: remove ? 'Đang xóa...' : 'Đang lưu...' });
    const res = await apiPost('/api/admin/projects/domain', { custom_domain: val });
    if (res.status === 200 && res.body?.ok) {
      setDomain((d) => ({ ...d, current: res.body.custom_domain || '', input: res.body.custom_domain || '', target: res.body.cname_target || d.target, cfManaged: res.body.cf_managed !== false, cfAttached: !!res.body.cf_attached, cfStatus: res.body.cf_status || '' }));
      if (!res.body.custom_domain) {
        setDomainMsg({ type: 'success', text: 'Đã xóa tên miền.' });
      } else if (res.body.cf_attached) {
        setDomainMsg({ type: 'success', text: `Đã lưu và tự gắn lên Cloudflare: ${res.body.custom_domain}. Tạo bản ghi CNAME tại DNS là domain sẽ chạy.` });
      } else if (res.body.cf_managed === false) {
        setDomainMsg({ type: 'success', text: `Đã lưu: ${res.body.custom_domain}. Site này chưa có quyền tự gắn domain — vào Cloudflare dashboard → Pages → Custom domains để thêm tay, rồi tạo bản ghi CNAME tại DNS.` });
      } else {
        setDomainMsg({ type: 'error', text: `Đã lưu nhưng chưa tự gắn được lên Cloudflare (${res.body.cf_error || 'lỗi không rõ'}). Vào Cloudflare dashboard → Pages → Custom domains để thêm tay ${res.body.custom_domain}.` });
      }
    } else {
      setDomainMsg({ type: 'error', text: res.body?.detail || res.body?.error || 'Lưu thất bại' });
    }
  };

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;

  const pct = quota.isSuper ? 100 : Math.min(100, Math.round((quota.used / quota.limit) * 100));
  const remaining = Math.max(0, quota.limit - quota.used);
  const tierColor = quota.isSuper ? 'blue' : pct >= 100 ? 'red' : 'green';

  const cnameHost = domain.input || 'blog.example.com';
  const cnameTarget = domain.target;

  // Public blog entry point for the active project. Always points at
  // /blog — on a shared host that is /<slug>/blog, on a custom domain
  // https://<domain>/blog.
  const blogUrl = activeProject ? absoluteUrl(projectUrl('/blog')) : '';

  return (
    <PageContainer
      title="Tổng quan"
      description="Tổng quan hoạt động và trạng thái dự án"
      breadcrumb={[{ title: 'Tổng quan' }]}
      extra={
        <Space>
          <Button type="primary" icon={<PlusOutlined />} href="#blog">Tạo bài viết</Button>
          <Button icon={<ThunderboltOutlined />} href="#seo">IndexNow</Button>
        </Space>
      }
    >
      {/* Action center — everything that needs a human, in one place */}
      {attention.items.length > 0 && (
        <Card
          size="small"
          style={{ marginBottom: 24 }}
          title={
            <Space>
              <WarningOutlined style={{ color: attention.counts.critical ? '#ff4d4f' : '#faad14' }} />
              Cần xử lý
              {attention.counts.critical > 0 && <Tag color="error">{attention.counts.critical} nghiêm trọng</Tag>}
              {attention.counts.warning > 0 && <Tag color="warning">{attention.counts.warning} cảnh báo</Tag>}
              {attention.counts.info > 0 && <Tag>{attention.counts.info} gợi ý</Tag>}
            </Space>
          }
        >
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {attention.items.map((it) => {
              const color = it.severity === 'critical' ? '#ff4d4f' : it.severity === 'warning' ? '#faad14' : '#8c8c8c';
              const Icon = it.severity === 'info' ? InfoCircleOutlined : WarningOutlined;
              return (
                <Row key={it.id} gutter={[12, 8]} align="middle" wrap={false}>
                  <Col flex="none"><Icon style={{ color, fontSize: 16 }} /></Col>
                  <Col flex="auto" style={{ minWidth: 0 }}>
                    <Text strong style={{ fontSize: 13 }}>
                      {it.title}
                      {it.count ? <Tag style={{ marginLeft: 6, fontSize: 11 }}>{it.count}</Tag> : null}
                    </Text>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>{it.detail}</Text></div>
                  </Col>
                  <Col flex="none">
                    <Button size="small" href={it.action.href}>{it.action.label}</Button>
                  </Col>
                </Row>
              );
            })}
          </Space>
        </Card>
      )}

      {/* Activation checklist — only while there is something left to do */}
      {activation && !activation.complete && (
        <Card
          size="small"
          style={{ marginBottom: 24 }}
          title={
            <Space>
              <RocketOutlined />
              Hoàn tất thiết lập
              <Progress
                type="circle"
                size={22}
                percent={Math.round((activation.required_done / activation.required_total) * 100)}
                format={() => `${activation.required_done}/${activation.required_total}`}
              />
            </Space>
          }
          extra={
            activation.metrics?.time_to_first_post_hours != null && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Bài đầu tiên sau {activation.metrics.time_to_first_post_hours} giờ
              </Text>
            )
          }
        >
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {activation.steps.map((st) => (
              <Row key={st.key} gutter={[12, 8]} align="middle" wrap={false}>
                <Col flex="none">
                  {st.done
                    ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                    : <ClockCircleOutlined style={{ color: '#bfbfbf', fontSize: 16 }} />}
                </Col>
                <Col flex="auto" style={{ minWidth: 0 }}>
                  <Text strong={!st.done} type={st.done ? 'secondary' : undefined} style={{ fontSize: 13 }}>
                    {st.title}
                    {st.optional && <Tag style={{ marginLeft: 6, fontSize: 11 }}>tùy chọn</Tag>}
                  </Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>{st.detail}</Text></div>
                </Col>
                <Col flex="none">
                  {!st.done && <Button size="small" href={st.action.href}>{st.action.label}</Button>}
                </Col>
              </Row>
            ))}
          </Space>
        </Card>
      )}

      {/* Project info hero */}
      {activeProject && (
        <Card style={{ marginBottom: 24, overflow: 'hidden' }}>
          <Row gutter={[24, 16]} align="middle">
            <Col xs={24} sm={4} style={{ textAlign: 'center' }}>
              {activeProject.logo_url ? (
                <img src={activeProject.logo_url} alt={activeProject.site_name || activeProject.slug} style={{ maxWidth: 80, maxHeight: 80, borderRadius: 8, objectFit: 'cover' }} />
              ) : (
                <Avatar size={80} style={{ backgroundColor: activeProject.theme_color || '#1677ff' }}>
                  {(activeProject.site_name || activeProject.slug || 'P')[0]?.toUpperCase()}
                </Avatar>
              )}
            </Col>
            <Col xs={24} sm={12}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Space>
                  <Text strong style={{ fontSize: 20 }}>{activeProject.site_name || activeProject.name || activeProject.slug}</Text>
                  {activeProject.status === 'active' ? <Tag color="success">Hoạt động</Tag> : <Tag color="default">{activeProject.status}</Tag>}
                </Space>
                {activeProject.site_description && (
                  <Tooltip title={activeProject.site_description}>
                    <Text type="secondary" style={{ display: 'block', maxWidth: 420 }} ellipsis>{shorten(activeProject.site_description, 90)}</Text>
                  </Tooltip>
                )}
                <Space size="small" wrap>
                  {blogUrl && (
                    <Link href={blogUrl} target="_blank">
                      <Space size={4}>
                        <GlobalOutlined />
                        {blogUrl.replace(/^https?:\/\//, '')}
                      </Space>
                    </Link>
                  )}
                  {activeProject.website_url && (
                    <Link href={activeProject.website_url} target="_blank">
                      <Space size={4}><ShopOutlined />Website</Space>
                    </Link>
                  )}
                </Space>
              </Space>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ marginTop: 4 }}>
                {/* Compact label/value rows — long AI blurbs are truncated
                    to one line and revealed in full via tooltip. */}
                <Row gutter={0} style={{ marginBottom: 6 }}>
                  <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Slug</Text></Col>
                  <Col span={16}><Text code style={{ fontSize: 12 }}>{activeProject.slug}</Text></Col>
                </Row>

                {brand?.business_type && (
                  <Row gutter={0} style={{ marginBottom: 6 }}>
                    <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Loại hình</Text></Col>
                    <Col span={16}>
                      <Tooltip title={brand.business_type} placement="topLeft">
                        <Text style={{ fontSize: 12 }} ellipsis>{shorten(brand.business_type, 52)}</Text>
                      </Tooltip>
                    </Col>
                  </Row>
                )}

                {brand?.target_audience && (
                  <Row gutter={0} style={{ marginBottom: 6 }}>
                    <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Khách hàng</Text></Col>
                    <Col span={16}>
                      <Tooltip title={brand.target_audience} placement="topLeft">
                        <Text style={{ fontSize: 12 }} ellipsis>{shorten(brand.target_audience, 52)}</Text>
                      </Tooltip>
                    </Col>
                  </Row>
                )}

                {brand?.service_area && (
                  <Row gutter={0} style={{ marginBottom: 6 }}>
                    <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Khu vực</Text></Col>
                    <Col span={16}>
                      <Space size={4}><EnvironmentOutlined style={{ fontSize: 11, color: '#8c8c8c' }} /><Text style={{ fontSize: 12 }}>{shorten(brand.service_area, 40)}</Text></Space>
                    </Col>
                  </Row>
                )}

                {brand?.key_themes && (
                  <Row gutter={0} style={{ marginBottom: 6 }}>
                    <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Chủ đề</Text></Col>
                    <Col span={16}>
                      <Space size={[4, 4]} wrap>
                        {themeList(brand.key_themes, 3).map((t) => (
                          <Tag key={t} style={{ margin: 0, fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</Tag>
                        ))}
                        {themeList(brand.key_themes, 99).length > 3 && (
                          <Tooltip title={themeList(brand.key_themes, 99).join(', ')}>
                            <Tag style={{ margin: 0, fontSize: 11 }}>+{themeList(brand.key_themes, 99).length - 3}</Tag>
                          </Tooltip>
                        )}
                      </Space>
                    </Col>
                  </Row>
                )}

                <div style={{ marginTop: 8 }}>
                  <Link href="#brand" style={{ fontSize: 12 }}><EditOutlined /> Chỉnh sửa Brand DNA</Link>
                </div>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* Quota hero */}
      <Card style={{ marginBottom: 24, borderLeft: `4px solid ${tierColor === 'blue' ? '#1677ff' : tierColor === 'red' ? '#ff4d4f' : '#52c41a'}` }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} sm={8}>
            <Statistic
              title="Gói hiện tại"
              value={quota.isSuper ? 'Doanh Nghiệp' : 'Cơ Bản (Free)'}
              prefix={<Tag color={tierColor}>{quota.isSuper ? 'SUPER' : 'FREE'}</Tag>}
            />
          </Col>
          <Col xs={24} sm={10}>
            <div style={{ marginBottom: 4 }}>
              <Text strong>{quota.used}</Text>
              <Text type="secondary"> / {quota.isSuper ? '∞' : quota.limit} bài viết</Text>
            </div>
            <Progress
              percent={pct}
              status={pct >= 100 ? 'exception' : 'active'}
              strokeColor={tierColor === 'blue' ? '#1677ff' : tierColor === 'red' ? '#ff4d4f' : '#52c41a'}
              size="small"
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {quota.isSuper ? 'Toàn quyền tạo & quản lý mọi dự án' : remaining > 0 ? `Còn lại ${remaining} bài viết miễn phí` : 'Đã hết hạn ngạch miễn phí'}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Stat tiles */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Bài viết đã xuất bản"
              value={stats.published}
              prefix={<FileTextOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Trang Prog SEO"
              value={stats.prog}
              prefix={<AppstoreOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Hàng đợi chờ"
              value={stats.queue}
              prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Lịch đã lên"
              value={calendar.scheduled}
              suffix={calendar.today > 0 ? <Tag color="processing" style={{ fontSize: 10, marginLeft: 4 }}>Hôm nay {calendar.today}</Tag> : null}
              prefix={<CalendarOutlined style={{ color: '#722ed1' }} />}
            />
            {calendar.nextDate && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Tiếp theo: {new Date(calendar.nextDate + 'T00:00:00Z').toLocaleDateString('vi-VN', { day: '2-digit', month: 'short' })}
              </Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* Quick actions */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={8}>
          <Card hoverable onClick={() => { window.location.hash = 'brand'; }} style={{ cursor: 'pointer' }}>
            <Space>
              <Avatar size={40} style={{ backgroundColor: '#1677ff' }}><ShopOutlined /></Avatar>
              <div>
                <Text strong>Brand DNA</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>{brand?.business_type ? 'Đã thiết lập' : 'Chưa thiết lập'}</Text>
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card hoverable onClick={() => { window.location.hash = 'calendar'; }} style={{ cursor: 'pointer' }}>
            <Space>
              <Avatar size={40} style={{ backgroundColor: '#722ed1' }}><CalendarOutlined /></Avatar>
              <div>
                <Text strong>Lịch nội dung</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>{calendar.total} lịch · {calendar.published} đã xuất bản</Text>
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card hoverable onClick={() => { window.location.hash = 'blog'; }} style={{ cursor: 'pointer' }}>
            <Space>
              <Avatar size={40} style={{ backgroundColor: '#52c41a' }}><FileTextOutlined /></Avatar>
              <div>
                <Text strong>Tạo bài viết</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>{stats.published} đã xuất bản · {stats.queue} chờ</Text>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* Social distribution — Facebook Page posts */}
      <Card
        title={<Space><SendOutlined /> Bài đăng mạng xã hội</Space>}
        size="small"
        style={{ marginBottom: 24 }}
        extra={<a href="#social">Xem tất cả →</a>}
      >
        {(() => {
          const jobs = social.jobs || [];
          const counts = social.counts || {};
          const publishedJobs = jobs.filter((j) => j.status === 'published');
          const reconnect = jobs.some((j) => j.needs_reconnect);

          if (!jobs.length) {
            return (
              <Alert
                type="info"
                showIcon
                message="Chưa có bài nào đăng lên mạng xã hội"
                description={<span>Vào <a href="#publishing">Kênh xuất bản</a> để kết nối Facebook Page. Sau đó mỗi bài blog xuất bản sẽ tự động được đăng.</span>}
              />
            );
          }

          return (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {reconnect && (
                <Alert
                  type="error"
                  showIcon
                  icon={<WarningOutlined />}
                  message="Kênh cần kết nối lại"
                  description={<span>Có bài không đăng được. Vào <a href="#publishing">Kênh xuất bản</a> để kết nối lại.</span>}
                />
              )}
              <Row gutter={[16, 12]}>
                <Col xs={12} sm={6}><Statistic title="Đã đăng" value={counts.published || 0} valueStyle={{ color: '#52c41a', fontSize: 20 }} /></Col>
                <Col xs={12} sm={6}><Statistic title="Chờ đăng" value={counts.pending || 0} valueStyle={{ color: '#faad14', fontSize: 20 }} /></Col>
                <Col xs={12} sm={6}><Statistic title="Thất bại" value={counts.failed || 0} valueStyle={{ color: counts.failed ? '#ff4d4f' : undefined, fontSize: 20 }} /></Col>
                <Col xs={12} sm={6}><Statistic title="Đã huỷ" value={counts.skipped || 0} valueStyle={{ fontSize: 20 }} /></Col>
              </Row>

              {publishedJobs.length > 0 && (
                <>
                  <Text type="secondary" style={{ fontSize: 12 }}>Bài đã đăng gần đây</Text>
                  <Row gutter={[12, 12]}>
                    {publishedJobs.slice(0, 6).map((j) => (
                      <Col xs={12} sm={8} lg={4} key={j.id}>
                        <a href={j.external_url || '#'} target="_blank" rel="noopener">
                          <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #f0f0f0' }}>
                            {j.hero_image_key
                              ? <img src={`/image/${j.hero_image_key}`} alt="" loading="lazy" style={{ width: '100%', height: 70, objectFit: 'cover', display: 'block' }} />
                              : <div style={{ height: 70, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SendOutlined style={{ color: '#bfbfbf' }} /></div>}
                            <div style={{ padding: '4px 6px' }}>
                              <Text ellipsis style={{ fontSize: 11, display: 'block' }}>{j.post_title || '—'}</Text>
                              <Text type="secondary" style={{ fontSize: 10 }}>
                                {j.published_at ? new Date(j.published_at * 1000).toLocaleDateString('vi-VN') : ''}
                              </Text>
                            </div>
                          </div>
                        </a>
                      </Col>
                    ))}
                  </Row>
                </>
              )}
            </Space>
          );
        })()}
      </Card>

      {/* Custom domain */}
      <Card
        title={<Space><GlobalOutlined /> Tên miền riêng</Space>}
        extra={
          <Space>
            {domain.current ? (
              <Badge status="success" text={<Text strong>{domain.current}</Text>} />
            ) : (
              <Tag>Chưa thiết lập</Tag>
            )}
            <Button
              size="small"
              type="text"
              icon={<QuestionCircleOutlined />}
              onClick={() => setGuideOpen((v) => !v)}
            >
              {guideOpen ? 'Ẩn hướng dẫn' : 'Hướng dẫn'}
            </Button>
          </Space>
        }
      >
        {domainMsg && (
          <Alert
            type={domainMsg.type === 'error' ? 'error' : domainMsg.type === 'success' ? 'success' : 'info'}
            message={domainMsg.text}
            style={{ marginBottom: 16 }}
            closable
            onClose={() => setDomainMsg(null)}
          />
        )}

        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {/* Status box */}
          {domain.current ? (
            <Alert
              type={domain.cfAttached ? 'success' : 'warning'}
              showIcon
              icon={domain.cfAttached ? <CheckCircleOutlined /> : <InfoCircleOutlined />}
              message={
                <Space>
                  <Text strong>Đã kết nối: </Text>
                  <Link href={`https://${domain.current}`} target="_blank">{domain.current}</Link>
                </Space>
              }
              description={
                domain.cfAttached
                  ? `Cloudflare đã gắn tên miền${domain.cfStatus ? ` (trạng thái: ${domain.cfStatus})` : ''}. Nếu chưa vào được, kiểm tra bản ghi CNAME tại DNS.`
                  : domain.cfManaged === false
                    ? 'Site chưa tự gắn được tên miền lên Cloudflare — thêm tay trong dashboard (Pages → Custom domains) rồi tạo CNAME tại DNS.'
                    : 'Tên miền đã lưu nhưng Cloudflare chưa gắn — tạo bản ghi CNAME tại DNS rồi đợi vài phút, hoặc thêm tay trong dashboard (Pages → Custom domains).'
              }
            />
          ) : (
            <Alert
              type="info"
              showIcon
              message="Đang dùng đường dẫn mặc định"
              description="Thiết lập tên miền riêng để blog chạy trên domain của bạn (vd: blog.example.com)"
            />
          )}

          {/* Input row */}
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="vd: blog.example.com"
              value={domain.input}
              onChange={(e) => setDomain((d) => ({ ...d, input: e.target.value }))}
              prefix={<LinkOutlined />}
            />
            <Button type="primary" icon={<SaveOutlined />} onClick={() => saveDomain(false)}>Lưu</Button>
            {domain.current && (
              <Popconfirm title="Xóa tên miền này?" onConfirm={() => saveDomain(true)}>
                <Button danger icon={<DeleteOutlined />}>Xóa</Button>
              </Popconfirm>
            )}
          </Space.Compact>

          {/* Detailed guide — toggle on/off */}
          {guideOpen && (
            <Card type="inner" title={<Space><InfoCircleOutlined /> Hướng dẫn thiết lập CNAME</Space>} size="small">
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                {/* Step 1 */}
                <div>
                  <Space align="start">
                    <Badge count={1} style={{ backgroundColor: '#1677ff' }} />
                    <div>
                      <Text strong>Nhập tên miền và lưu</Text>
                      <br />
                      <Text type="secondary">Nhập subdomain hoặc domain bạn muốn dùng cho blog (vd: blog.example.com) rồi nhấn "Lưu".</Text>
                    </div>
                  </Space>
                </div>

                {/* Step 2 */}
                <div>
                  <Space align="start">
                    <Badge count={2} style={{ backgroundColor: '#1677ff' }} />
                    <div>
                      <Text strong>Tạo bản ghi CNAME tại nhà cung cấp DNS</Text>
                      <br />
                      <Text type="secondary">Đăng nhập vào trang quản lý DNS của bạn (Cloudflare, GoDaddy, Namecheap...) và tạo bản ghi:</Text>
                    </div>
                  </Space>
                  <Card size="small" style={{ marginTop: 8, background: '#fafafa' }}>
                    <Row gutter={[8, 8]}>
                      <Col xs={24} sm={8}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Loại (Type):</Text>
                        <br />
                        <Text code strong>CNAME</Text>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Tên (Name/Host):</Text>
                        <br />
                        <Text code strong>{cnameHost}</Text>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Giá trị (Value/Target):</Text>
                        <br />
                        <Text code strong>{cnameTarget}</Text>
                      </Col>
                    </Row>
                  </Card>
                </div>

                {/* Step 3 */}
                <div>
                  <Space align="start">
                    <Badge count={3} style={{ backgroundColor: '#1677ff' }} />
                    <div>
                      <Text strong>Đợi DNS truyền (5-30 phút)</Text>
                      <br />
                      <Text type="secondary">Sau khi tạo CNAME, đợi 5-30 phút để DNS truyền. Cloudflare thường nhanh hơn (1-5 phút).</Text>
                    </div>
                  </Space>
                </div>

                {/* Step 4 */}
                <div>
                  <Space align="start">
                    <Badge count={4} style={{ backgroundColor: '#1677ff' }} />
                    <div>
                      <Text strong>Kiểm tra tên miền</Text>
                      <br />
                      <Text type="secondary">Mở </Text>
                      <Link href={`https://${cnameHost}`} target="_blank">https://{cnameHost}</Link>
                      <Text type="secondary"> — nếu blog hiện ra là thành công.</Text>
                    </div>
                  </Space>
                </div>

                {/* Notes */}
                <Alert
                  type="warning"
                  showIcon
                  message="Lưu ý"
                  description={
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      <li>Tên miền phải là <b>subdomain</b> (vd: blog.example.com), không dùng domain gốc.</li>
                      <li>Nếu dùng Cloudflare DNS, đặt CNAME ở chế độ <b>DNS only</b> (bỏ Proxy) để tránh xung đột SSL.</li>
                      <li>SSL tự động cấp bởi Cloudflare Pages — không cần cấu hình thêm.</li>
                      <li>Sau khi xóa tên miền, blog sẽ quay lại dùng đường dẫn mặc định.</li>
                    </ul>
                  }
                />

                {/* Example providers */}
                <div>
                  <Text strong>Ví dụ theo nhà cung cấp DNS:</Text>
                  <Collapse
                    ghost
                    size="small"
                    style={{ marginTop: 8 }}
                    items={[
                      {
                        key: 'cloudflare',
                        label: 'Cloudflare DNS',
                        children: (
                          <ol style={{ paddingLeft: 20 }}>
                            <li>Vào <Text code>dash.cloudflare.com</Text> → chọn domain</li>
                            <li>Tab <Text code>DNS</Text> → <Text code>Records</Text> → <Text code>Add record</Text></li>
                            <li>Type: <Text code>CNAME</Text> · Name: <Text code>{cnameHost}</Text> · Target: <Text code>{cnameTarget}</Text></li>
                            <li>Proxy status: <Text code>DNS only</Text> (bỏ cam)</li>
                            <li>Nhấn <Text code>Save</Text></li>
                          </ol>
                        ),
                      },
                      {
                        key: 'godaddy',
                        label: 'GoDaddy',
                        children: (
                          <ol style={{ paddingLeft: 20 }}>
                            <li>Vào <Text code>dcc.godaddy.com</Text> → quản lý DNS</li>
                            <li>Thêm bản ghi: Type <Text code>CNAME</Text> · Name <Text code>{cnameHost}</Text> · Value <Text code>{cnameTarget}</Text></li>
                            <li>TTL: 600s · Nhấn <Text code>Save</Text></li>
                          </ol>
                        ),
                      },
                      {
                        key: 'namecheap',
                        label: 'Namecheap',
                        children: (
                          <ol style={{ paddingLeft: 20 }}>
                            <li>Vào <Text code>ap.www.namecheap.com</Text> → Advanced DNS</li>
                            <li>Add New Record: Type <Text code>CNAME Record</Text> · Host <Text code>{cnameHost}</Text> · Value <Text code>{cnameTarget}</Text></li>
                            <li>TTL: Automatic · Nhấn <Text code>Save</Text></li>
                          </ol>
                        ),
                      },
                    ]}
                  />
                </div>
              </Space>
            </Card>
          )}
        </Space>
      </Card>
    </PageContainer>
  );
}
