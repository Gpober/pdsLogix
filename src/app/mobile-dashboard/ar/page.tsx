"use client";

import {
  useState,
  useEffect,
  useMemo,
} from "react";
import {
  Menu,
  X,
  ChevronLeft,
  Award,
  Target,
  Home,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabaseClient";

// I AM CFO Brand Colors
const BRAND_COLORS = {
  primary: '#56B6E9',
  secondary: '#3A9BD1', 
  tertiary: '#7CC4ED',
  accent: '#2E86C1',
  success: '#27AE60',
  warning: '#F39C12',
  danger: '#E74C3C',
  gray: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0'
  }
};

interface PropertySummary {
  name: string;
  current?: number;
  days30?: number;
  days60?: number;
  days90?: number;
  over90?: number;
  total?: number;
}

interface ARTransaction {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  daysOutstanding: number;
  customer: string;
  memo?: string | null;
}

type RankingMetric = "arTotal" | "arCurrent" | "arOverdue";

const calculateDaysOutstanding = (dueDate: string) => {
  const due = new Date(dueDate);
  const today = new Date();
  const diff = today.getTime() - due.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

const getAgingBucket = (days: number): string => {
  if (days <= 30) return "current";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  if (days <= 120) return "91-120";
  return "120+";
};

const getAgingColor = (days: number) => {
  if (days <= 30) return BRAND_COLORS.success;
  if (days <= 60) return BRAND_COLORS.warning;
  if (days <= 90) return "#f59e0b";
  return BRAND_COLORS.danger;
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

const bucketLabels: Record<string, string> = {
  current: "Current (0-30 Days)",
  "31-60": "31-60 Days",
  "61-90": "61-90 Days",
  "90+": "90+ Days",
};

export default function ARAgingDashboard() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<"overview" | "summary" | "report" | "detail">("overview");
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [arTransactions, setArTransactions] = useState<ARTransaction[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [rankingMetric, setRankingMetric] = useState<RankingMetric | null>(null);

  const filteredARTransactions = useMemo(() => {
    return arTransactions.filter((t) => {
      const bucket = getAgingBucket(t.daysOutstanding);
      if (selectedCategory === "90+") {
        return bucket === "91-120" || bucket === "120+";
      }
      return bucket === selectedCategory;
    });
  }, [arTransactions, selectedCategory]);

  const filteredARTotal = useMemo(
    () => filteredARTransactions.reduce((sum, t) => sum + t.amount, 0),
    [filteredARTransactions],
  );

  // Load properties data from Supabase
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("ar_aging_detail")
        .select("*")
        .gt("open_balance", 0);
        
      const map: Record<string, PropertySummary> = {};
      
      (data || []).forEach((rec: any) => {
        const customer = rec.customer || "General";
        if (!map[customer]) {
          map[customer] = {
            name: customer,
            current: 0,
            days30: 0,
            days60: 0,
            days90: 0,
            over90: 0,
            total: 0,
          };
        }
        
        const amt = Number(rec.open_balance) || 0;
        const days = calculateDaysOutstanding(rec.due_date);
        const bucket = getAgingBucket(days);
        
        if (bucket === "current") map[customer].current = (map[customer].current || 0) + amt;
        else if (bucket === "31-60") map[customer].days30 = (map[customer].days30 || 0) + amt;
        else if (bucket === "61-90") map[customer].days60 = (map[customer].days60 || 0) + amt;
        else if (bucket === "91-120") map[customer].days90 = (map[customer].days90 || 0) + amt;
        else map[customer].over90 = (map[customer].over90 || 0) + amt;
        
        map[customer].total = (map[customer].total || 0) + amt;
      });
      
      setProperties(Object.values(map));
    };
    load();
  }, []);

  const arKing = useMemo(() => {
    if (!properties.length) return null;
    return properties.reduce((max, p) =>
      (p.total || 0) > (max.total || 0) ? p : max,
    properties[0]).name;
  }, [properties]);

  const currentChamp = useMemo(() => {
    if (!properties.length) return null;
    return properties.reduce((max, p) => {
      const ratioP = p.total ? (p.current || 0) / (p.total || 1) : 0;
      const ratioM = max.total ? (max.current || 0) / (max.total || 1) : 0;
      return ratioP > ratioM ? p : max;
    }, properties[0]).name;
  }, [properties]);

  const overdueAlert = useMemo(() => {
    if (!properties.length) return null;
    return properties.reduce((max, p) => {
      const overdueP = (p.total || 0) - (p.current || 0);
      const overdueM = (max.total || 0) - (max.current || 0);
      return overdueP > overdueM ? p : max;
    }, properties[0]).name;
  }, [properties]);

  const avgDays = useMemo(() => {
    if (!properties.length) return 0;
    const weighted = properties.reduce((sum, p) =>
      sum + ((p.current || 0) * 15 + (p.days30 || 0) * 45 + (p.days60 || 0) * 75 + (p.days90 || 0) * 105 + (p.over90 || 0) * 135),
    0);
    const total = properties.reduce((sum, p) => sum + (p.total || 0), 0);
    return total ? Math.round(weighted / total) : 0;
  }, [properties]);

  const companyTotals = properties.reduce(
    (acc, p) => {
      acc.current += p.current || 0;
      acc.days30 += p.days30 || 0;
      acc.days60 += p.days60 || 0;
      acc.days90 += p.days90 || 0;
      acc.over90 += p.over90 || 0;
      acc.net += p.total || 0;
      return acc;
    },
    { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, net: 0 }
  );

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);

  const formatCompactCurrency = (n: number) => {
    if (Math.abs(n) >= 1000000) {
      return `${(n / 1000000).toFixed(1)}M`;
    } else if (Math.abs(n) >= 1000) {
      return `${(n / 1000).toFixed(1)}K`;
    }
    return formatCurrency(n);
  };

  const rankingLabels: Record<RankingMetric, string> = {
    arTotal: "Total A/R",
    arCurrent: "Current Ratio",
    arOverdue: "Overdue A/R",
  };

  const rankedProperties = useMemo(() => {
    if (!rankingMetric) return [];
    const arr = [...properties];
    switch (rankingMetric) {
      case "arTotal":
        return arr.sort((a, b) => (b.total || 0) - (a.total || 0));
      case "arCurrent":
        return arr.sort((a, b) => {
          const rA = a.total ? (a.current || 0) / (a.total || 1) : 0;
          const rB = b.total ? (b.current || 0) / (b.total || 1) : 0;
          return rB - rA;
        });
      case "arOverdue":
        return arr.sort(
          (a, b) =>
            ((b.total || 0) - (b.current || 0)) -
            ((a.total || 0) - (a.current || 0)),
        );
      default:
        return arr;
    }
  }, [properties, rankingMetric]);

  const formatRankingValue = (p: PropertySummary) => {
    switch (rankingMetric) {
      case "arTotal":
        return formatCompactCurrency(p.total || 0);
      case "arCurrent":
        const rc = p.total ? (p.current || 0) / (p.total || 1) : 0;
        return `${(rc * 100).toFixed(1)}%`;
      case "arOverdue":
        return formatCompactCurrency((p.total || 0) - (p.current || 0));
      default:
        return formatCompactCurrency(0);
    }
  };

  const showRanking = (metric: RankingMetric) => {
    setRankingMetric(metric);
    setView("summary");
  };

  const showARTransactions = (bucket: string) => {
    setSelectedCategory(bucket);
    setView("detail");
  };

  const handlePropertySelect = async (name: string | null) => {
    setSelectedProperty(name);
    await loadAR(name);
    setView("report");
  };

  const loadAR = async (propertyName: string | null = selectedProperty) => {
    let query = supabase
      .from("ar_aging_detail")
      .select("*")
      .gt("open_balance", 0);
      
    if (propertyName) {
      query = query.eq("customer", propertyName);
    }
    
    const { data } = await query;
    const list: ARTransaction[] = (data as any[] || []).map((rec) => ({
      invoiceNumber: rec.number || "",
      invoiceDate: rec.date,
      dueDate: rec.due_date,
      amount: Number(rec.open_balance) || 0,
      daysOutstanding: calculateDaysOutstanding(rec.due_date),
      customer: rec.customer,
      memo: rec.memo || null,
    }));
    
    setArTransactions(list);
  };

  const back = () => {
    if (view === "detail") setView("report");
    else if (view === "report") setView("overview");
    else if (view === "summary") {
      setRankingMetric(null);
      setView("overview");
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh',
      background: BRAND_COLORS.gray[50],
      padding: '16px',
      position: 'relative'
    }}>
      <style jsx>{`
        @keyframes slideDown {
          0% {
            opacity: 0;
            transform: translateY(-10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* Enhanced Header */}
      <header style={{
        background: `linear-gradient(135deg, ${BRAND_COLORS.warning}, #F8B500)`,
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '24px',
        color: 'white',
        boxShadow: `0 8px 32px ${BRAND_COLORS.warning}33`
      }}>
        <div className="relative flex items-center justify-center mb-4">
          <button
            onClick={() => router.push('/mobile-dashboard')}
            className="absolute left-0"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <Home size={20} />
          </button>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="absolute right-0"
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              color: 'white'
            }}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <span
            onClick={() => handlePropertySelect(null)}
            style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', cursor: 'pointer' }}
          >
            I AM CFO
          </span>
        </div>

        {/* Dashboard Summary */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            A/R Aging Report
          </h1>
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            As of Today • {properties.length} Customers
          </p>
        </div>

        {/* Company Total */}
        <div
          onClick={() => handlePropertySelect(null)}
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            borderRadius: '12px',
            padding: '20px',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '14px', opacity: 0.9 }}>Total Outstanding</span>
            <div style={{ fontSize: '32px', fontWeight: 'bold', margin: '8px 0' }}>
              {formatCompactCurrency(companyTotals.net)}
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.current)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>Current</div>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.days30)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>31-60</div>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.days60)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>61-90</div>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.days90)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>91-120</div>
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCompactCurrency(companyTotals.over90)}
              </div>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>120+</div>
            </div>
          </div>
        </div>
      </header>

      {/* Menu - Simple version for AR */}
      {menuOpen && (
        <div style={{
          position: 'absolute',
          top: '80px',
          left: '16px',
          right: '16px',
          background: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 8px 40px rgba(0, 0, 0, 0.15)',
          border: `2px solid ${BRAND_COLORS.gray[200]}`,
          zIndex: 1000,
          animation: 'slideDown 0.3s ease-out'
        }}>
          <p style={{ margin: 0, fontSize: '14px', color: BRAND_COLORS.gray[600] }}>
            A/R Aging shows real-time outstanding receivables.
          </p>
          <button
            style={{
              width: '100%',
              marginTop: '16px',
              padding: '12px',
              background: `linear-gradient(135deg, ${BRAND_COLORS.warning}, #F8B500)`,
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
            onClick={() => setMenuOpen(false)}
          >
            Close
          </button>
        </div>
      )}

      {view === "overview" && (
        <div>
          {/* Customer Insights */}
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            border: `1px solid ${BRAND_COLORS.gray[200]}`,
            boxShadow: '0 4px 20px rgba(243, 156, 18, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Target size={20} style={{ color: BRAND_COLORS.warning }} />
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: BRAND_COLORS.warning }}>
                Customer Insights
              </h3>
            </div>
            
            {/* Awards Section */}
            <div style={{
              background: `linear-gradient(135deg, ${BRAND_COLORS.gray[50]}, #fffbeb)`,
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              border: `1px solid ${BRAND_COLORS.warning}33`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <Award size={16} style={{ color: BRAND_COLORS.warning }} />
                <span style={{ fontSize: '14px', fontWeight: '600', color: BRAND_COLORS.warning }}>
                  Customer Champions
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                <div onClick={() => showRanking("arTotal")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.primary}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>💰</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.primary, fontWeight: '600' }}>
                      A/R KING
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {arKing}
                    </div>
                  </div>
                </div>
                <div onClick={() => showRanking("arCurrent")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.success}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>✓</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.success, fontWeight: '600' }}>
                      CURRENT CHAMP
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {currentChamp}
                    </div>
                  </div>
                </div>
                <div onClick={() => showRanking("arOverdue")} style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.danger}33`,
                  cursor: 'pointer'
                }}>
                  <span style={{ fontSize: '20px' }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.danger, fontWeight: '600' }}>
                      OVERDUE ALERT
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {overdueAlert}
                    </div>
                  </div>
                </div>
                <div style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  border: `1px solid ${BRAND_COLORS.accent}33`
                }}>
                  <span style={{ fontSize: '20px' }}>📅</span>
                  <div>
                    <div style={{ fontSize: '11px', color: BRAND_COLORS.accent, fontWeight: '600' }}>
                      AVG DAYS
                    </div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>
                      {avgDays}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Customer Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {properties.map((p) => {
              const isArKing = p.name === arKing;
              const isCurrentChamp = p.name === currentChamp;
              const isOverdueAlert = p.name === overdueAlert;
              
              return (
                <div
                  key={p.name}
                  onClick={() => handlePropertySelect(p.name)}
                  style={{
                    background: selectedProperty === p.name 
                      ? `linear-gradient(135deg, ${BRAND_COLORS.warning}15, #F8B50015)` 
                      : 'white',
                    border: selectedProperty === p.name 
                      ? `3px solid ${BRAND_COLORS.warning}` 
                      : `2px solid ${BRAND_COLORS.gray[200]}`,
                    borderRadius: '16px',
                    padding: '18px',
                    cursor: 'pointer',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: selectedProperty === p.name 
                      ? `0 8px 32px ${BRAND_COLORS.warning}40` 
                      : '0 4px 16px rgba(0, 0, 0, 0.08)',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: '-20px',
                    right: '-20px',
                    width: '60px',
                    height: '60px',
                    background: `linear-gradient(135deg, ${BRAND_COLORS.warning}20, #F8B50010)`,
                    borderRadius: '50%',
                    opacity: 0.6
                  }} />
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <span style={{ 
                      fontWeight: '700', 
                      fontSize: '15px', 
                      color: BRAND_COLORS.accent
                    }}>
                      {p.name}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {isArKing && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.primary}, #0ea5e9)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(14,165,233,0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>💰</span>
                        </div>
                      )}
                      {isCurrentChamp && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.success}, #22c55e)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(34,197,94,0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>✓</span>
                        </div>
                      )}
                      {isOverdueAlert && (
                        <div style={{
                          background: `linear-gradient(135deg, ${BRAND_COLORS.danger}, #ef4444)`,
                          borderRadius: '12px',
                          padding: '4px 6px',
                          boxShadow: '0 2px 8px rgba(239,68,68,0.3)'
                        }}>
                          <span style={{ fontSize: '16px' }}>⚠️</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: `${BRAND_COLORS.success}20`,
                      borderRadius: '6px'
                    }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Current</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.success }}>
                        {formatCompactCurrency(p.current || 0)}
                      </span>
                    </div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: `${BRAND_COLORS.warning}20`,
                      borderRadius: '6px'
                    }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>31-60</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.warning }}>
                        {formatCompactCurrency(p.days30 || 0)}
                      </span>
                    </div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: `${BRAND_COLORS.danger}20`,
                      borderRadius: '6px'
                    }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>61+</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.danger }}>
                        {formatCompactCurrency((p.days60 || 0) + (p.days90 || 0) + (p.over90 || 0))}
                      </span>
                    </div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '10px',
                      background: `linear-gradient(135deg, ${BRAND_COLORS.primary}10, ${BRAND_COLORS.tertiary}05)`,
                      borderRadius: '8px',
                      border: `2px solid ${BRAND_COLORS.primary}30`,
                      boxShadow: `0 4px 12px ${BRAND_COLORS.primary}20`
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: BRAND_COLORS.accent }}>Total A/R</span>
                      <span style={{ fontSize: '14px', fontWeight: '800', color: BRAND_COLORS.primary }}>
                        {formatCompactCurrency(p.total || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "summary" && rankingMetric && (
        <div>
          <button
            onClick={back}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              fontSize: '16px',
              color: BRAND_COLORS.warning,
              marginBottom: '20px',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={20} style={{ marginRight: '4px' }} />
            Back to Overview
          </button>

          <div
            style={{
              background: `linear-gradient(135deg, ${BRAND_COLORS.warning}, #F8B500)`,
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
              color: 'white'
            }}
          >
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
              Top Customers by {rankingLabels[rankingMetric]}
            </h2>
            <p style={{ fontSize: '14px', opacity: 0.9 }}>
              As of Today
            </p>
          </div>

          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '12px' }}>
            {rankedProperties.map((p, idx) => (
              <li
                key={p.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'white',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${BRAND_COLORS.gray[200]}`
                }}
              >
                <span style={{ fontWeight: '600' }}>{idx + 1}. {p.name}</span>
                <span style={{ fontWeight: '600', color: BRAND_COLORS.warning }}>
                  {formatRankingValue(p)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {view === "report" && (
        <div>
          <button 
            onClick={back}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              fontSize: '16px',
              color: BRAND_COLORS.warning,
              marginBottom: '20px',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={20} style={{ marginRight: '4px' }} /> 
            Back to Customers
          </button>
          
          <div style={{
            background: `linear-gradient(135deg, ${BRAND_COLORS.warning}, #F8B500)`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            color: 'white'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
              {selectedProperty || "Company Total"} - A/R Aging
            </h2>
            <p style={{ fontSize: '14px', opacity: 0.9 }}>
              As of Today
            </p>
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            <div onClick={() => showARTransactions('current')} style={{ background: `${BRAND_COLORS.success}20`, borderRadius: '8px', padding: '16px', cursor: 'pointer' }}>
              <div style={{ fontWeight: '600', color: BRAND_COLORS.success }}>Current (0-30 Days)</div>
              <div style={{ fontSize: '20px', fontWeight: '700', textAlign: 'right', color: BRAND_COLORS.success }}>
                {formatCurrency((selectedProperty ? properties.find(p=>p.name===selectedProperty) : { current: companyTotals.current }).current || 0)}
              </div>
            </div>
            <div onClick={() => showARTransactions('31-60')} style={{ background: `${BRAND_COLORS.warning}20`, borderRadius: '8px', padding: '16px', cursor: 'pointer' }}>
              <div style={{ fontWeight: '600', color: BRAND_COLORS.warning }}>31-60 Days</div>
              <div style={{ fontSize: '20px', fontWeight: '700', textAlign: 'right', color: BRAND_COLORS.warning }}>
                {formatCurrency((selectedProperty ? properties.find(p=>p.name===selectedProperty) : { days30: companyTotals.days30 }).days30 || 0)}
              </div>
            </div>
            <div onClick={() => showARTransactions('61-90')} style={{ background: `#f59e0b20`, borderRadius: '8px', padding: '16px', cursor: 'pointer' }}>
              <div style={{ fontWeight: '600', color: '#f59e0b' }}>61-90 Days</div>
              <div style={{ fontSize: '20px', fontWeight: '700', textAlign: 'right', color: '#f59e0b' }}>
                {formatCurrency((selectedProperty ? properties.find(p=>p.name===selectedProperty) : { days60: companyTotals.days60 }).days60 || 0)}
              </div>
            </div>
            <div onClick={() => showARTransactions('90+')} style={{ background: `${BRAND_COLORS.danger}20`, borderRadius: '8px', padding: '16px', cursor: 'pointer' }}>
              <div style={{ fontWeight: '600', color: BRAND_COLORS.danger }}>90+ Days</div>
              <div style={{ fontSize: '20px', fontWeight: '700', textAlign: 'right', color: BRAND_COLORS.danger }}>
                {formatCurrency(((selectedProperty ? properties.find(p=>p.name===selectedProperty) : { days90: companyTotals.days90, over90: companyTotals.over90 }).days90 || 0) + ((selectedProperty ? properties.find(p=>p.name===selectedProperty) : { days90: companyTotals.days90, over90: companyTotals.over90 }).over90 || 0))}
              </div>
            </div>
          </div>
        </div>
      )}

      {view === "detail" && (
        <div>
          <button
            onClick={back}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              fontSize: '16px',
              color: BRAND_COLORS.warning,
              marginBottom: '20px',
              cursor: 'pointer'
            }}
          >
            <ChevronLeft size={20} style={{ marginRight: '4px' }} />
            Back to A/R
          </button>

          <div style={{
            background: `linear-gradient(135deg, ${BRAND_COLORS.warning}, #F8B500)`,
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            color: 'white'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
              {bucketLabels[selectedCategory || ""]}
            </h2>
            <p style={{ fontSize: '14px', opacity: 0.9 }}>
              Invoice Details • As of Today
            </p>
          </div>
          
          <div style={{ display: 'grid', gap: '12px' }}>
            {filteredARTransactions.map((t, idx) => (
              <div
                key={idx}
                style={{
                  background: 'white',
                  borderRadius: '8px',
                  padding: '16px',
                  border: `1px solid ${BRAND_COLORS.gray[200]}`,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', marginBottom: '4px' }}>
                  <span>{t.invoiceNumber} - {t.customer}</span>
                  <span style={{ color: getAgingColor(t.daysOutstanding) }}>{formatCurrency(t.amount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#64748b' }}>
                  <span>
                    {formatDate(t.invoiceDate)} • Due {formatDate(t.dueDate)}
                  </span>
                  <span style={{ color: getAgingColor(t.daysOutstanding), fontWeight: '600' }}>
                    {t.daysOutstanding} days
                  </span>
                </div>
                {t.memo && <div style={{ fontSize: '12px', marginTop: '4px' }}>{t.memo}</div>}
              </div>
            ))}
          </div>
          
          <div
            style={{
              marginTop: '16px',
              textAlign: 'right',
              fontSize: '14px',
              fontWeight: '600',
              color: BRAND_COLORS.primary,
            }}
          >
            Total Outstanding: {formatCurrency(filteredARTotal)}
          </div>
        </div>
      )}
    </div>
  );
}
