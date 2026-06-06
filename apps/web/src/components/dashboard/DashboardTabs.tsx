import { useDashboardStore, type DashboardTab } from '../../stores/dashboardStore';

const tabs: { key: DashboardTab; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'projects', label: 'Your projects' },
  { key: 'trends', label: 'Trend templates' },
  { key: 'brands', label: 'Brand systems' },
];

export default function DashboardTabs() {
  const { activeTab, setActiveTab } = useDashboardStore();

  return (
    <div className="dashboard__tabs">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`dashboard__tab ${activeTab === t.key ? 'dashboard__tab--active' : ''}`}
          onClick={() => setActiveTab(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
