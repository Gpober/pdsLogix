'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Menu, X } from 'lucide-react'

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
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A'
  }
}

interface ReportHeaderProps {
  title: string
  subtitle: string
  showDateFilter?: boolean
  reportPeriod?: "Monthly" | "Custom" | "Year to Date" | "Trailing 12" | "Quarterly"
  month?: number
  year?: number
  customStart?: string
  customEnd?: string
  onFiltersChange?: (filters: {
    reportPeriod: "Monthly" | "Custom" | "Year to Date" | "Trailing 12" | "Quarterly"
    month: number
    year: number
    customStart: string
    customEnd: string
  }) => void
}

export default function ReportHeader({
  title,
  subtitle,
  showDateFilter = true,
  reportPeriod = "Monthly",
  month = new Date().getMonth() + 1,
  year = new Date().getFullYear(),
  customStart = "",
  customEnd = "",
  onFiltersChange
}: ReportHeaderProps) {
  const router = useRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [tempReportPeriod, setTempReportPeriod] = useState(reportPeriod)
  const [tempMonth, setTempMonth] = useState(month)
  const [tempYear, setTempYear] = useState(year)
  const [tempCustomStart, setTempCustomStart] = useState(customStart)
  const [tempCustomEnd, setTempCustomEnd] = useState(customEnd)

  const handleBack = () => {
    router.push('/mobile-dashboard')
  }

  const handleApplyFilters = () => {
    if (onFiltersChange) {
      onFiltersChange({
        reportPeriod: tempReportPeriod,
        month: tempMonth,
        year: tempYear,
        customStart: tempCustomStart,
        customEnd: tempCustomEnd
      })
    }
    
    setIsMenuOpen(false)
  }

  return (
    <>
      <div style={{
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(10px)',
        borderBottom: `3px solid ${BRAND_COLORS.primary}`,
        padding: '20px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        boxShadow: '0 2px 20px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <button
            onClick={handleBack}
            style={{
              background: BRAND_COLORS.primary,
              border: 'none',
              borderRadius: '12px',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(86, 182, 233, 0.3)',
              transition: 'all 0.2s ease',
              flexShrink: 0
            }}
          >
            <ChevronLeft size={24} color="white" />
          </button>

          <div style={{ flex: 1 }}>
            <h1 style={{
              margin: 0,
              fontSize: '24px',
              fontWeight: 'bold',
              color: BRAND_COLORS.gray[900]
            }}>
              {title}
            </h1>
            <p style={{
              margin: 0,
              fontSize: '14px',
              color: BRAND_COLORS.gray[600]
            }}>
              {subtitle}
            </p>
          </div>

          {showDateFilter && (
            <button
              onClick={() => setIsMenuOpen(true)}
              style={{
                background: BRAND_COLORS.gray[100],
                border: 'none',
                borderRadius: '12px',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flexShrink: 0
              }}
            >
              <Menu size={24} color={BRAND_COLORS.gray[700]} />
            </button>
          )}
        </div>
      </div>

      {isMenuOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 999,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-end'
        }}
        onClick={() => setIsMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              width: '320px',
              maxWidth: '90%',
              height: '100vh',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
              animation: 'slideInRight 0.3s ease-out',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <style jsx>{`
              @keyframes slideInRight {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
            `}</style>

            <div style={{
              padding: '20px',
              borderBottom: `2px solid ${BRAND_COLORS.gray[200]}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 'bold',
                color: BRAND_COLORS.gray[900]
              }}>
                Date Filters
              </h2>
              <button
                onClick={() => setIsMenuOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px'
                }}
              >
                <X size={24} color={BRAND_COLORS.gray[600]} />
              </button>
            </div>

            <div style={{
              flex: 1,
              padding: '20px',
              overflowY: 'auto'
            }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: BRAND_COLORS.accent }}>
                  Report Period
                </label>
                <select
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: `2px solid ${BRAND_COLORS.gray[200]}`,
                    borderRadius: '8px',
                    fontSize: '16px',
                    outline: 'none'
                  }}
                  value={tempReportPeriod}
                  onChange={(e) =>
                    setTempReportPeriod(e.target.value as "Monthly" | "Custom" | "Year to Date" | "Trailing 12" | "Quarterly")
                  }
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Custom">Custom Range</option>
                  <option value="Year to Date">Year to Date</option>
                  <option value="Trailing 12">Trailing 12 Months</option>
                  <option value="Quarterly">Quarterly</option>
                </select>
              </div>

              {tempReportPeriod === "Custom" ? (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: BRAND_COLORS.gray[700], marginBottom: '8px' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={tempCustomStart}
                    onChange={(e) => setTempCustomStart(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: `2px solid ${BRAND_COLORS.gray[200]}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      marginBottom: '12px'
                    }}
                  />
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: BRAND_COLORS.gray[700], marginBottom: '8px' }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={tempCustomEnd}
                    onChange={(e) => setTempCustomEnd(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: `2px solid ${BRAND_COLORS.gray[200]}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: BRAND_COLORS.gray[700], marginBottom: '8px' }}>
                      Month
                    </label>
                    <select
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: `2px solid ${BRAND_COLORS.gray[200]}`,
                        borderRadius: '8px',
                        fontSize: '16px',
                        outline: 'none'
                      }}
                      value={tempMonth}
                      onChange={(e) => setTempMonth(Number(e.target.value))}
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(0, i).toLocaleString("en", { month: "long" })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: BRAND_COLORS.gray[700], marginBottom: '8px' }}>
                      Year
                    </label>
                    <select
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: `2px solid ${BRAND_COLORS.gray[200]}`,
                        borderRadius: '8px',
                        fontSize: '16px',
                        outline: 'none'
                      }}
                      value={tempYear}
                      onChange={(e) => setTempYear(Number(e.target.value))}
                    >
                      {Array.from({ length: 5 }, (_, i) => {
                        const y = new Date().getFullYear() - 2 + i
                        return (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div style={{
              padding: '20px',
              borderTop: `2px solid ${BRAND_COLORS.gray[200]}`
            }}>
              <button
                onClick={handleApplyFilters}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: `linear-gradient(135deg, ${BRAND_COLORS.primary} 0%, ${BRAND_COLORS.secondary} 100%)`,
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: 'white',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(86, 182, 233, 0.3)'
                }}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
