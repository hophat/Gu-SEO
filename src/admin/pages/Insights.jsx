// Insights — platform-level product analytics (super_admin only).
//
// Answers the questions that decide whether the product keeps its customers:
// where people drop off between signup and first post, how long activation
// takes, and whether projects that activated are still publishing in week 2/3/4.
//
// Everything here is derived from projects/blog_posts rather than logged as
// events (see functions/_lib/insights.js), so the numbers are retroactive and
// cannot drift from what actually happened. The event log at the bottom only
// covers decisions that are not derivable.
//
// API: /api/admin/insights
import { useState, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Statistic, Table, Typography, Space, Tag, Alert,
  Tooltip, Empty, Skeleton, Button,
} from 'antd';
import {
  ReloadOutlined, RiseOutlined, TeamOutlined, FileTextOutlined, ThunderboltOutlined,
  CheckCircleOutlined, WarningOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import PageContainer from '../components/PageContainer.jsx';
import { apiGet } from '../api.js';

const { Text } = Typography;

// Green → amber → red as a retention percentage falls. Reads as a heatmap
// without needing a chart library.
function pctColor(pct) {
  if (pct >= 70) return '#52c41a';
  if (pct >= 40) return '#faad14';
  if (pct > 0) return '#ff7a45';
  return '#d9d9d9';
}

function Bar({ pct, color = '#1677ff' }) {
  return (
    <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 3, height: 8, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  );
}

export default function Insights() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { status, body } = await apiGet('/api/admin/insights');
    if (status === 200 && body?.ok) setData(body);
    else setError(body?.error || `HTTP ${status}`);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <PageContainer title="Tăng trưởng"><Skeleton active paragraph={{ rows: 10 }} /></PageContainer>;
  if (error) {
    return (
      <PageContainer title="Tăng trưởng">
        <Alert
          type={error === 'forbidden' ? 'warning' : 'error'}
          showIcon
          message={error === 'forbidden' ? 'Chỉ quản trị nền tảng xem được trang này' : 'Không tải được dữ liệu'}
          description={error !== 'forbidden' ? error : 'Trang này tổng hợp dữ liệu của mọi dự án nên chỉ super_admin truy cập được.'}
        />
      </PageContainer>
    );
  }

  const { totals, funnel, time_to_first_post: ttfp, retention, weekly, projects, events } = data;
  const maxWeekly = Math.max(1, ...weekly.map((w) => w.posts));
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));

  return (
    <PageContainer
      title="Tăng trưởng"
      description="Funnel kích hoạt, retention theo tuần và sức khoẻ từng dự án"
      breadcrumb={[{ title: 'Hệ thống' }, { title: 'Tăng trưởng' }]}
      extra={<Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Tải lại</Button>}
    >
      {/* Totals */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Dự án" value={totals.projects} prefix={<TeamOutlined />} /></Card></Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Đang hoạt động"
              value={totals.projects_healthy}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>/{totals.projects}</Text>}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
            <Text type="secondary" style={{ fontSize: 11 }}>có bài trong 7 ngày qua</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Bài đã xuất bản" value={totals.published_posts} prefix={<FileTextOutlined />} /></Card></Col>
        <Col xs={12} sm={6}><Card size="small"><Statistic title="Bài / dự án" value={totals.posts_per_project} prefix={<RiseOutlined />} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]}>
        {/* Funnel */}
        <Col xs={24} lg={14}>
          <Card title="Funnel kích hoạt" size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
              {funnel.map((f, i) => {
                const prev = i > 0 ? funnel[i - 1] : null;
                // Step-to-step drop is the actionable number; the cumulative
                // percentage hides which step is actually losing people.
                const drop = prev && prev.count > 0 ? Math.round(((prev.count - f.count) / prev.count) * 100) : null;
                // A cohort too young to have reached this step must not show a
                // 0% — that reads as churn when the truth is "not measurable".
                const notYet = f.measurable === false;
                return (
                  <div key={f.key}>
                    <Row gutter={8} align="middle" wrap={false}>
                      <Col flex="none" style={{ width: 170 }}>
                        <Text style={{ fontSize: 13 }}>{f.label}</Text>
                      </Col>
                      <Col flex="auto" style={{ minWidth: 0 }}>
                        {notYet
                          ? <div style={{ borderTop: '1px dashed #d9d9d9', marginTop: 4 }} />
                          : <Bar pct={(f.count / maxFunnel) * 100} color={i === 0 ? '#1677ff' : pctColor(f.pct)} />}
                      </Col>
                      <Col flex="none" style={{ width: 110, textAlign: 'right' }}>
                        {notYet ? (
                          <Tooltip title={`Dự án cũ nhất mới ${totals.oldest_project_age_days} ngày — cần ${f.measurable_after_days} ngày mới đo được`}>
                            <Text type="secondary" style={{ fontSize: 12 }}>chưa đủ dữ liệu</Text>
                          </Tooltip>
                        ) : (
                          <>
                            <Text strong style={{ fontSize: 13 }}>{f.count}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}> · {f.pct}%</Text>
                          </>
                        )}
                      </Col>
                      <Col flex="none" style={{ width: 64, textAlign: 'right' }}>
                        {!notYet && drop != null && drop > 0
                          ? <Tag color={drop >= 50 ? 'error' : 'warning'} style={{ margin: 0, fontSize: 11 }}>−{drop}%</Tag>
                          : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>}
                      </Col>
                    </Row>
                  </div>
                );
              })}
            </Space>
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 14 }}
              message="Cột cuối là tỷ lệ rơi giữa hai bước"
              description="Bước nào rơi nhiều nhất là bước cần sửa trước. Bước 'Còn hoạt động tuần 2' quan trọng hơn cả tỷ lệ kích hoạt — dự án có bài đầu tiên nhưng dừng ở tuần 2 thì vẫn là khách rời bỏ."
            />
          </Card>
        </Col>

        {/* Time to first post */}
        <Col xs={24} lg={10}>
          <Card title={<Space><ThunderboltOutlined /> Thời gian tới bài đầu tiên</Space>} size="small" style={{ marginBottom: 16 }}>
            {ttfp.n === 0 ? (
              <Empty description="Chưa có dự án nào xuất bản bài" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Row gutter={12}>
                  <Col span={8}><Statistic title="Trung vị" value={ttfp.median_hours} suffix="giờ" valueStyle={{ fontSize: 20 }} /></Col>
                  <Col span={8}><Statistic title="P25" value={ttfp.p25_hours} suffix="giờ" valueStyle={{ fontSize: 20 }} /></Col>
                  <Col span={8}><Statistic title="P75" value={ttfp.p75_hours} suffix="giờ" valueStyle={{ fontSize: 20 }} /></Col>
                </Row>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Dưới 24 giờ: {ttfp.under_24h}/{ttfp.n}</Text>
                  <Bar pct={(ttfp.under_24h / ttfp.n) * 100} color="#52c41a" />
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>Dưới 72 giờ: {ttfp.under_72h}/{ttfp.n}</Text>
                  <Bar pct={(ttfp.under_72h / ttfp.n) * 100} color="#faad14" />
                </div>
              </Space>
            )}
          </Card>
        </Col>
      </Row>

      {/* Retention */}
      <Card title="Retention theo tuần đăng ký" size="small" style={{ marginBottom: 16 }}>
        {retention.length === 0 ? (
          <Empty description="Chưa có dự án" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Table
            dataSource={retention}
            rowKey="cohort"
            size="small"
            pagination={false}
            scroll={{ x: 720 }}
            columns={[
              { title: 'Tuần đăng ký', dataIndex: 'cohort', key: 'cohort', width: 130,
                render: (c) => <Text code>{c}</Text> },
              { title: 'Dự án', dataIndex: 'size', key: 'size', width: 80 },
              { title: 'Bài', dataIndex: 'posts', key: 'posts', width: 70 },
              ...['w1', 'w2', 'w3', 'w4'].map((w, i) => ({
                title: `Tuần ${i + 1}`, key: w, width: 110,
                render: (_, r) => {
                  // Week N has only happened if the cohort is at least N weeks
                  // old. Showing 0% for a week that has not occurred yet would
                  // read as churn.
                  const occurred = r.weeks_elapsed >= i;
                  if (!occurred) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
                  return (
                    <Space size={6}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: pctColor(r[`${w}_pct`]) }} />
                      <Text style={{ fontSize: 12 }}>{r[`${w}_pct`]}%</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>({r[w]})</Text>
                    </Space>
                  );
                },
              })),
            ]}
          />
        )}
        <Text type="secondary" style={{ fontSize: 12 }}>
          Tuần 1 = 7 ngày đầu sau khi tạo dự án. Ô màu là tỷ lệ dự án trong cohort có ít nhất một bài xuất bản trong tuần đó.
        </Text>
      </Card>

      {/* Weekly activity */}
      <Card title="Sản lượng theo tuần" size="small" style={{ marginBottom: 16 }}>
        {weekly.length === 0 ? (
          <Empty description="Chưa có bài nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {weekly.map((w) => (
              <Row key={w.week} gutter={8} align="middle" wrap={false}>
                <Col flex="none" style={{ width: 90 }}><Text code style={{ fontSize: 12 }}>{w.week}</Text></Col>
                <Col flex="auto" style={{ minWidth: 0 }}>
                  <Bar pct={(w.posts / maxWeekly) * 100} color="#1677ff" />
                </Col>
                <Col flex="none" style={{ width: 130, textAlign: 'right' }}>
                  <Text style={{ fontSize: 12 }}>{w.posts} bài · {w.projects} dự án</Text>
                </Col>
              </Row>
            ))}
          </Space>
        )}
      </Card>

      {/* Per-project health */}
      <Card title="Sức khoẻ từng dự án" size="small" style={{ marginBottom: 16 }}>
        <Table
          dataSource={projects}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 15, showSizeChanger: false }}
          scroll={{ x: 860 }}
          locale={{ emptyText: 'Chưa có dự án' }}
          columns={[
            { title: 'Dự án', dataIndex: 'name', key: 'name', ellipsis: true,
              render: (n, r) => <Space direction="vertical" size={0}><Text strong style={{ fontSize: 13 }}>{n}</Text><Text type="secondary" style={{ fontSize: 11 }}>{r.slug}</Text></Space> },
            { title: 'Trạng thái', key: 'health', width: 110,
              render: (_, r) => r.healthy
                ? <Tag color="success" icon={<CheckCircleOutlined />}>Đang chạy</Tag>
                : r.posts === 0
                  ? <Tag color="error" icon={<WarningOutlined />}>Chưa có bài</Tag>
                  : <Tag color="warning" icon={<ClockCircleOutlined />}>Đã dừng</Tag> },
            { title: 'Tuổi', dataIndex: 'age_days', key: 'age', width: 80, render: (d) => `${d} ngày` },
            { title: 'Bài', dataIndex: 'posts', key: 'posts', width: 70 },
            { title: 'Bài đầu (giờ)', dataIndex: 'first_post_hours', key: 'ttfp', width: 110,
              render: (h) => h == null ? <Text type="secondary">—</Text> : h },
            { title: 'Lần cuối', dataIndex: 'days_since_last_post', key: 'last', width: 100,
              render: (d) => d == null ? <Text type="secondary">—</Text> : (d === 0 ? 'hôm nay' : `${d} ngày trước`) },
            { title: 'Thiết lập', key: 'setup', width: 150,
              render: (_, r) => (
                <Space size={4}>
                  <Tooltip title="Brand DNA"><Tag color={r.has_brand_dna ? 'green' : 'default'} style={{ margin: 0 }}>DNA</Tag></Tooltip>
                  <Tooltip title="Lịch nội dung"><Tag color={r.has_schedule ? 'green' : 'default'} style={{ margin: 0 }}>Lịch</Tag></Tooltip>
                  <Tooltip title="Kênh mạng xã hội"><Tag color={r.has_channel ? 'green' : 'default'} style={{ margin: 0 }}>Kênh</Tag></Tooltip>
                </Space>
              ) },
          ]}
        />
      </Card>

      {/* Event log */}
      <Card title="Sự kiện đã ghi" size="small">
        {events.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="Chưa có sự kiện nào"
            description="Event log chỉ ghi những quyết định không suy ra được từ dữ liệu sẵn có (đăng ký, tạo Brand DNA, kết nối kênh…). Các số ở trên không phụ thuộc vào nó."
          />
        ) : (
          <Table
            dataSource={events}
            rowKey="event"
            size="small"
            pagination={false}
            columns={[
              { title: 'Sự kiện', dataIndex: 'event', key: 'event', render: (e) => <Text code>{e}</Text> },
              { title: 'Số lần', dataIndex: 'count', key: 'count', width: 100 },
              { title: 'Lần cuối', dataIndex: 'last_at', key: 'last', width: 170,
                render: (t) => t ? new Date(t * 1000).toLocaleString('vi-VN') : '—' },
            ]}
          />
        )}
      </Card>
    </PageContainer>
  );
}
