import Link from "next/link";
import {
  formatLogTimestamp,
  type DashboardActivityItem,
  type DashboardActivityKind,
} from "@/lib/admin/admin-logs";

type DashboardStats = {
  totalUsers: number;
  activeRooms: number;
  postsToday: number;
  pendingReports: number;
};

type AdminDashboardProps = {
  stats: DashboardStats;
  chartLabels: string[];
  usersSeries: number[];
  postsSeries: number[];
  activities: DashboardActivityItem[];
};

const numberFormat = new Intl.NumberFormat("en-US");

function formatNumber(value: number) {
  return numberFormat.format(value);
}

// Both charts share one frame: a y-axis in whole numbers with gridlines, a
// label under every day, and today picked out in orange.
const CHART = { w: 420, h: 176, left: 30, right: 10, top: 18, bottom: 26 };
const plotW = CHART.w - CHART.left - CHART.right;
const plotH = CHART.h - CHART.top - CHART.bottom;

// Counts are whole numbers, so the axis tops out at a multiple of 4 and every
// gridline lands on a whole number.
function axisMax(data: number[]) {
  return Math.max(4, Math.ceil(Math.max(...data, 0) / 4) * 4);
}

function ChartFrame({
  labels,
  data,
  label,
  children,
}: {
  labels: string[];
  data: number[];
  label: string;
  children: (geometry: {
    max: number;
    x: (index: number) => number;
    y: (value: number) => number;
    step: number;
  }) => React.ReactNode;
}) {
  const max = axisMax(data);
  const step = plotW / data.length;
  const x = (index: number) => CHART.left + step * (index + 0.5);
  const y = (value: number) => CHART.top + plotH - (value / max) * plotH;
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);

  return (
    <svg
      viewBox={`0 0 ${CHART.w} ${CHART.h}`}
      className="mt-4 h-auto w-full"
      role="img"
      aria-label={label}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={CHART.left}
            x2={CHART.w - CHART.right}
            y1={y(tick)}
            y2={y(tick)}
            className={tick === 0 ? "stroke-ink/40" : "stroke-edge-strong"}
            strokeDasharray={tick === 0 ? undefined : "3 4"}
            strokeWidth="1"
          />
          <text
            x={CHART.left - 6}
            y={y(tick) + 3.5}
            textAnchor="end"
            className="fill-ink-soft text-[10px]"
          >
            {tick}
          </text>
        </g>
      ))}

      {children({ max, x, y, step })}

      {labels.map((text, index) => (
        <text
          key={`${text}-${index}`}
          x={x(index)}
          y={CHART.h - 8}
          textAnchor="middle"
          className={`text-[11px] ${
            index === labels.length - 1
              ? "fill-kmutt-orange-dark font-bold"
              : "fill-ink-soft"
          }`}
        >
          {text}
        </text>
      ))}
    </svg>
  );
}

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-center text-xs text-ink-soft/70">{children}</p>
  );
}

// กราฟเส้น
function UserChart({
  labels,
  data,
}: {
  labels: string[];
  data: number[];
}) {
  const hasData = data.some((value) => value > 0);

  return (
    <div>
      <ChartFrame
        labels={labels}
        data={data}
        label="กราฟจำนวนผู้ใช้ใหม่ในช่วง 7 วันที่ผ่านมา"
      >
        {({ x, y }) => {
          const line = data.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const baseY = y(0);

          return (
            <>
              {hasData && (
                <>
                  <polygon
                    points={`${x(0)},${baseY} ${line} ${x(data.length - 1)},${baseY}`}
                    className="fill-kmutt-yellow/30"
                  />
                  <polyline
                    points={line}
                    fill="none"
                    className="stroke-ink"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}
              {data.map((value, index) => {
                const today = index === data.length - 1;

                return (
                  <g key={`${labels[index]}-${index}`}>
                    <title>{`${labels[index]}: ${value} คน`}</title>
                    <circle
                      cx={x(index)}
                      cy={y(value)}
                      r={today ? 5 : 3.5}
                      className={`stroke-ink ${
                        today ? "fill-kmutt-orange-dark" : "fill-white"
                      }`}
                      strokeWidth="1.5"
                    />
                    {value > 0 && (
                      <text
                        x={x(index)}
                        y={y(value) - 9}
                        textAnchor="middle"
                        className="fill-ink text-[11px] font-bold"
                      >
                        {value}
                      </text>
                    )}
                  </g>
                );
              })}
            </>
          );
        }}
      </ChartFrame>

      {!hasData && (
        <ChartEmpty>ยังไม่มีข้อมูลผู้สมัครในช่วง 7 วันที่ผ่านมา</ChartEmpty>
      )}
    </div>
  );
}

// กราฟแท่ง
function PostsChart({
  labels,
  data,
}: {
  labels: string[];
  data: number[];
}) {
  const hasData = data.some((value) => value > 0);

  return (
    <div>
      <ChartFrame
        labels={labels}
        data={data}
        label="กราฟจำนวนโพสต์ต่อวันในช่วง 7 วันที่ผ่านมา"
      >
        {({ x, y, step }) => {
          const barW = Math.min(26, step * 0.5);

          return (
            <>
              {data.map((value, index) => {
                const today = index === data.length - 1;
                const top = y(value);
                const height = y(0) - top;

                return (
                  <g key={`${labels[index]}-${index}`}>
                    <title>{`${labels[index]}: ${value} โพสต์`}</title>
                    {value > 0 && (
                      <>
                        <rect
                          x={x(index) - barW / 2}
                          y={top}
                          width={barW}
                          height={height}
                          rx="4"
                          className={
                            today ? "fill-kmutt-orange-dark" : "fill-ink"
                          }
                        />
                        <text
                          x={x(index)}
                          y={top - 6}
                          textAnchor="middle"
                          className="fill-ink text-[11px] font-bold"
                        >
                          {value}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}
            </>
          );
        }}
      </ChartFrame>

      {!hasData && <ChartEmpty>ยังไม่มีโพสต์ในช่วง 7 วันที่ผ่านมา</ChartEmpty>}
    </div>
  );
}

// ไอคอนกิจกรรม
function ActivityIcon({ kind }: { kind: DashboardActivityKind }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-butter text-ink-soft">
      {kind === "room" && (
        <svg
          aria-hidden="true"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 5h16v12H8l-4 3V5z" />
        </svg>
      )}
      {kind === "report" && (
        <svg
          aria-hidden="true"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3 2.8 19h18.4L12 3z" />
          <path d="M12 9v4" />
          <path d="M12 16h.01" />
        </svg>
      )}
      {kind === "sanction" && (
        <svg
          aria-hidden="true"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      )}
    </div>
  );
}

export default function AdminDashboard({
  stats,
  chartLabels,
  usersSeries,
  postsSeries,
  activities,
}: AdminDashboardProps) {
  const cards = [
    {
      title: "จำนวนผู้ใช้ทั้งหมด",
      value: stats.totalUsers,
      description: `${formatNumber(usersSeries.reduce((sum, value) => sum + value, 0))} คนสมัครใน 7 วันที่ผ่านมา`,
      danger: false,
    },
    {
      title: "จำนวนห้องที่กำลังใช้งาน",
      value: stats.activeRooms,
      description: "ห้องที่มีสถานะกำลังใช้งาน",
      danger: false,
    },
    {
      title: "จำนวนโพสต์วันนี้",
      value: stats.postsToday,
      description: "นับเฉพาะโพสต์หลัก ไม่รวมข้อความตอบกลับ",
      danger: false,
    },
    {
      title: "รายงานที่รอการดำเนินการ",
      value: stats.pendingReports,
      description: "จำนวนรายงานที่ยังไม่ได้ดำเนินการ",
      danger: true,
    },
  ];

  return (
    <div className="w-full">
      {/* Header */}
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold sm:text-[28px] leading-tight text-ink">
          แดชบอร์ด
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          ข้อมูลภาพรวมของกิจกรรมต่างๆบน AntiLonely
        </p>
      </header>

      {/* Statistics Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className="min-w-0 rounded-[10px] border border-edge-strong bg-white px-5 py-5"
          >
            <p className="text-xs font-semibold text-ink-soft">
              {card.title}
            </p>

            <p
              className={`mt-3 text-[30px] font-bold leading-none ${
                card.danger ? "text-red-700" : "text-ink"
              }`}
            >
              {formatNumber(card.value)}
            </p>

            <p
              className={`mt-3 text-xs ${
                card.danger ? "text-red-700" : "text-ink-soft"
              }`}
            >
              {card.description}
            </p>
          </div>
        ))}
      </section>

      {/* Charts */}
      <section className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="min-w-0 rounded-[12px] border border-edge-strong bg-white px-6 py-6">
          <h2 className="text-base font-bold text-ink">
            การเติบโตของผู้ใช้
          </h2>
          <p className="text-xs text-ink-soft">
            ผู้ใช้ที่ลงทะเบียนในช่วง 7 วันที่ผ่านมา
          </p>

          <UserChart labels={chartLabels} data={usersSeries} />
        </div>

        <div className="min-w-0 rounded-[12px] border border-edge-strong bg-white px-6 py-6">
          <h2 className="text-base font-bold text-ink">
            โพสต์ต่อวัน
          </h2>
          <p className="text-xs text-ink-soft">
            จำนวนโพสต์ทั้งหมดต่อวัน
          </p>

          <PostsChart labels={chartLabels} data={postsSeries} />
        </div>
      </section>

      {/* Recent Activities */}
      <section className="mt-6 rounded-[12px] border border-edge-strong bg-white px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink">กิจกรรมล่าสุด</h2>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              ติดตามความเคลื่อนไหวของผู้ใช้และผู้ดูแล
            </p>
          </div>

          <Link
            href="/admin/logs"
            className="inline-flex items-center gap-1.5 rounded-md bg-ink px-4 py-2 text-[13px] font-bold text-white hover:bg-ink/90 motion-safe:transition-colors motion-safe:duration-100"
          >
            <span>ดูกิจกรรมทั้งหมด</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {activities.length > 0 ? (
          <div>
            {activities.map((activity, index) => (
              <div
                key={activity.id}
                className={`flex min-w-0 items-center gap-3 py-3 ${
                  index !== activities.length - 1
                    ? "border-b border-edge-strong"
                    : ""
                }`}
              >
                <ActivityIcon kind={activity.kind} />

                <p
                  title={activity.text}
                  className="min-w-0 flex-1 truncate text-sm text-ink"
                >
                  {activity.text}
                </p>

                <time
                  dateTime={activity.createdAt}
                  title={formatLogTimestamp(activity.createdAt)}
                  className="shrink-0 text-xs text-ink-soft"
                >
                  {activity.timeAgo}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[120px] items-center justify-center text-sm text-ink-soft/70">
            ยังไม่มีกิจกรรมล่าสุด
          </div>
        )}
      </section>
    </div>
  );
}