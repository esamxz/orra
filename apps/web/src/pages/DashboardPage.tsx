import { useState } from 'react';
import { Search, Plus, Moon, Sun } from 'lucide-react';
import { useDashboardStore } from '../stores/dashboardStore';
import DashboardTabs from '../components/dashboard/DashboardTabs';
import CreateProjectPanel from '../components/dashboard/CreateProjectPanel';
import ProjectCard from '../components/dashboard/ProjectCard';
import TrendTemplateCard from '../components/dashboard/TrendTemplateCard';
import BrandSystemCard from '../components/dashboard/BrandSystemCard';
import UsageSummaryCard from '../components/dashboard/UsageSummaryCard';
import CreateBrandSystemModal from '../components/brand/CreateBrandSystemModal';
import '../styles/dashboard.css';

export default function DashboardPage() {
  const {
    activeTab,
    recentProjects,
    projects,
    trendTemplates,
    brandSystems,
    searchQuery,
    setSearchQuery,
    addBrandSystem,
  } = useDashboardStore();

  const [darkMode, setDarkMode] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const toggleDarkMode = () => {
    setDarkMode((v) => {
      const next = !v;
      document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__header-left">
          <div className="dashboard__logo">Orra</div>
        </div>
        <div className="dashboard__header-right">
          <button className="orra-btn orra-btn--small orra-btn--ghost" onClick={toggleDarkMode}>
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="orra-btn orra-btn--small orra-btn--secondary" onClick={() => setBrandModalOpen(true)}>
            <Plus size={14} />
            Brand system
          </button>
        </div>
      </header>

      <DashboardTabs />

      <div className="dashboard__content">
        {(activeTab === 'recent' || activeTab === 'projects') && (
          <>
            <CreateProjectPanel />
            <UsageSummaryCard />
            <div className="dashboard__search" style={{ marginTop: '1.5rem' }}>
              <Search size={16} style={{ color: 'var(--text-muted)' }} />
              <input
                className="orra-input dashboard__search-input"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="dashboard__grid" style={{ marginTop: '1rem' }}>
              {(activeTab === 'recent' ? recentProjects : filteredProjects).map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </>
        )}

        {activeTab === 'trends' && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <h2>Trend templates</h2>
              <p>Browse curated prompts to start your next design.</p>
            </div>
            <div className="dashboard__grid">
              {trendTemplates.map((template) => (
                <TrendTemplateCard key={template.id} template={template} />
              ))}
            </div>
          </>
        )}

        {activeTab === 'brands' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div>
                <h2>Brand systems</h2>
                <p>Reusable creative context for your projects.</p>
              </div>
              <button className="orra-btn orra-btn--primary" onClick={() => setBrandModalOpen(true)}>
                <Plus size={16} />
                Create brand system
              </button>
            </div>
            <div className="dashboard__grid">
              {brandSystems.map((brand) => (
                <BrandSystemCard key={brand.id} brand={brand} />
              ))}
            </div>
          </>
        )}
      </div>

      <CreateBrandSystemModal
        open={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        onCreate={addBrandSystem}
      />
    </div>
  );
}
