import React, { useEffect, useState } from 'react';
import './InnovationLanding.css';

// Minimal inline SVG system icons (Self-contained geometric vectors)
function IconChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3.5L10.5 8L6 12.5" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6.5" width="10" height="7.5" rx="1.5" />
      <path d="M5.5 6.5V4.5C5.5 3.12 6.62 2 8 2C9.38 2 10.5 3.12 10.5 4.5V6.5" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M2.5 4.25H13.5M2.5 8H13.5M2.5 11.75H13.5" />
    </svg>
  );
}

function IconCheckmark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
    </svg>
  );
}

export default function InnovationLanding({ onOpenLogin, onOpenPortal }) {
  const [activeTab, setActiveTab] = useState('drive-isolation');
  const [modalType, setModalType] = useState(null); // 'terms' | 'privacy' | null
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Deployment form state
  const [formState, setFormState] = useState({
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    userCount: '5',
    storageGB: '50',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [formError, setFormError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formState.companyName.trim()) {
      setFormError('Please enter your firm or company name.');
      return;
    }
    const phoneDigits = formState.phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      setFormError('Please enter a valid contact number.');
      return;
    }
    if (formState.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.email.trim())) {
      setFormError('Please enter a valid email address or leave it blank.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Send deployment lead to backend API endpoint
      const res = await fetch('/api/public/request-demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState)
      });

      if (!res.ok) {
        throw new Error('Request submission failed');
      }

      setIsSubmitting(false);
      setSubmitSuccess(true);
    } catch {
      setIsSubmitting(false);
      setFormError('We could not send your request right now. Please try again in a moment.');
    }
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSectionNavigation = (id) => {
    scrollToSection(id);
    setIsMenuOpen(false);
  };

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  return (
    <div className="iv-landing-root">
      {/* 1. TOP NAVIGATION */}
      <nav className="iv-nav" aria-label="Global Navigation">
        <div className="iv-container">
          <div className="iv-nav-inner">
            <a href="#" className="iv-brand-link" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              <span className="iv-brand-mark">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </span>
              <span>Innovation VPS</span>
            </a>

            <button
              type="button"
              className="iv-nav-menu-toggle"
              onClick={() => setIsMenuOpen(open => !open)}
              aria-label={isMenuOpen ? 'Close site navigation' : 'Open site navigation'}
              aria-expanded={isMenuOpen}
              aria-controls="innovation-vps-navigation"
            >
              {isMenuOpen ? <IconClose /> : <IconMenu />}
              <span>Menu</span>
            </button>

            <div id="innovation-vps-navigation" className={`iv-nav-panel${isMenuOpen ? ' is-open' : ''}`}>
              <ul className="iv-nav-links">
                <li className="iv-nav-item"><a href="#architecture" onClick={(e) => { e.preventDefault(); handleSectionNavigation('architecture'); }}>Architecture</a></li>
                <li className="iv-nav-item"><a href="#architecture" onClick={(e) => { e.preventDefault(); handleSectionNavigation('architecture'); }}>Drive Isolation</a></li>
                <li className="iv-nav-item"><a href="#shadow-assist" onClick={(e) => { e.preventDefault(); handleSectionNavigation('shadow-assist'); }}>Session Shadowing</a></li>
                <li className="iv-nav-item"><a href="#specifications" onClick={(e) => { e.preventDefault(); handleSectionNavigation('specifications'); }}>Specifications</a></li>
                <li className="iv-nav-item"><a href="#deploy" onClick={(e) => { e.preventDefault(); handleSectionNavigation('deploy'); }}>Deploy</a></li>
              </ul>

              <div className="iv-nav-actions">
                <button type="button" className="iv-btn iv-btn-secondary" onClick={() => { setIsMenuOpen(false); onOpenLogin(); }}>
                  Sign In
                </button>
                <button type="button" className="iv-btn iv-btn-primary" onClick={() => handleSectionNavigation('deploy')}>
                  Deploy Workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <header className="iv-hero">
        <div className="iv-container">
          <div className="iv-section-label">Enterprise Cloud Infrastructure for Tally Prime</div>
          <h1 className="iv-hero-headline">
            Dedicated multi-user hosting. Absolute drive isolation.
          </h1>
          <p className="iv-hero-summary">
            Engineered specifically for Indian accounting firms and enterprises requiring high-speed remote Tally access, independent NTFS volume sandboxing, and instant administrative session assistance.
          </p>

          <div className="iv-hero-ctas">
            <button type="button" className="iv-btn iv-btn-primary iv-btn-lg" onClick={() => scrollToSection('deploy')}>
              Deploy a Workspace
            </button>
            <button type="button" className="iv-btn iv-btn-link" onClick={() => scrollToSection('architecture')}>
              Explore architecture <IconChevronRight />
            </button>
          </div>

          <div className="iv-trust-row" aria-label="Infrastructure highlights">
            <div className="iv-trust-item">
              <span className="iv-trust-index">01</span>
              <span><strong>Dedicated client drives</strong><small>One isolated workspace per organisation</small></span>
            </div>
            <div className="iv-trust-item">
              <span className="iv-trust-index">02</span>
              <span><strong>Tally-ready infrastructure</strong><small>Built for concurrent accounting workflows</small></span>
            </div>
            <div className="iv-trust-item">
              <span className="iv-trust-index">03</span>
              <span><strong>Native support access</strong><small>Direct session assistance when needed</small></span>
            </div>
          </div>

          {/* REAL PRODUCT FRAME (Interactive Workspace Canvas) */}
          <div className="iv-product-frame" role="region" aria-label="Interactive Product Preview">
            <div className="iv-product-toolbar">
              <div className="iv-window-dots" aria-hidden="true">
                <span className="iv-dot" />
                <span className="iv-dot" />
                <span className="iv-dot" />
              </div>
              <div className="iv-node-pill">
                <span className="iv-status-dot" />
                <span>Node 43.227.184.60:30609 | Windows Server 2022 | Latency 14ms</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--iv-text-tertiary)' }}>Zero-Trust NTFS Active</div>
            </div>

            <div className="iv-product-layout">
              {/* Product Left Sidebar: Drives */}
              <div className="iv-product-sidebar">
                <div>
                  <div className="iv-sidebar-section-title">Sandboxed Drives</div>
                  <div className="iv-drive-item active">
                    <div>
                      <span className="iv-drive-letter">K:\</span> Durga_Metal
                    </div>
                    <span className="iv-drive-lock"><IconLock /></span>
                  </div>
                  <div className="iv-drive-item">
                    <div>
                      <span className="iv-drive-letter">L:\</span> Ecoguard_Tech
                    </div>
                    <span className="iv-drive-lock"><IconLock /></span>
                  </div>
                  <div className="iv-drive-item">
                    <div>
                      <span className="iv-drive-letter">M:\</span> Simran_Enterprises
                    </div>
                    <span className="iv-drive-lock"><IconLock /></span>
                  </div>
                  <div className="iv-drive-item">
                    <div>
                      <span className="iv-drive-letter">N:\</span> Dhwani_Rural
                    </div>
                    <span className="iv-drive-lock"><IconLock /></span>
                  </div>
                </div>

                <div style={{ marginTop: 'auto', padding: '12px', backgroundColor: 'var(--iv-surface)', borderRadius: 'var(--iv-radius-sm)', border: '1px solid var(--iv-border-subtle)', fontSize: '11px', color: 'var(--iv-text-secondary)' }}>
                  <strong style={{ color: 'var(--iv-text-primary)', display: 'block', marginBottom: '4px' }}>System Drive (C:\)</strong>
                  Standard users restricted from executing or browsing outside their mapped volume.
                </div>
              </div>

              {/* Product Main Stage: Active Workspace */}
              <div className="iv-product-stage">
                <div className="iv-stage-header">
                  <div>
                    <div className="iv-active-company">Durga Metal Industries Pvt Ltd</div>
                    <div className="iv-active-path">Data Path: K:\DurgaMetal\Data | Gateway Port: 10006</div>
                  </div>
                  <div className="iv-telemetry-badge-group">
                    <span className="iv-metric-chip">RAM: <strong>26.4% / 32 GB</strong></span>
                    <span className="iv-metric-chip">CPU: <strong>4% Load</strong></span>
                  </div>
                </div>

                {/* Session Table */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Active Remote Desktop Sessions</span>
                    <span style={{ fontSize: '12px', color: 'var(--iv-text-secondary)' }}>TSplus Seamless RemoteApp</span>
                  </div>

                  <table className="iv-session-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Session ID</th>
                        <th>State</th>
                        <th>Connected From</th>
                        <th>Live Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: 500 }}>ved</td>
                        <td style={{ fontFamily: 'var(--iv-font-mono)' }}>39</td>
                        <td>
                          <span className="iv-session-status-badge">
                            <span className="iv-status-dot" /> Active
                          </span>
                        </td>
                        <td style={{ color: 'var(--iv-text-secondary)' }}>New Delhi (18ms)</td>
                        <td>
                          <button type="button" className="iv-action-tag" onClick={() => scrollToSection('shadow-assist')}>
                            Shadow Assist
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 500 }}>accountant_mumbai</td>
                        <td style={{ fontFamily: 'var(--iv-font-mono)' }}>42</td>
                        <td>
                          <span className="iv-session-status-badge">
                            <span className="iv-status-dot" /> Active
                          </span>
                        </td>
                        <td style={{ color: 'var(--iv-text-secondary)' }}>Mumbai (24ms)</td>
                        <td>
                          <button type="button" className="iv-action-tag" onClick={() => scrollToSection('shadow-assist')}>
                            Shadow Assist
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 500 }}>auditor_pune</td>
                        <td style={{ fontFamily: 'var(--iv-font-mono)' }}>47</td>
                        <td>
                          <span className="iv-session-status-badge">
                            <span className="iv-status-dot" /> Active
                          </span>
                        </td>
                        <td style={{ color: 'var(--iv-text-secondary)' }}>Pune (28ms)</td>
                        <td>
                          <button type="button" className="iv-action-tag" onClick={() => scrollToSection('shadow-assist')}>
                            Shadow Assist
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{ backgroundColor: 'var(--iv-surface-subtle)', padding: '12px 16px', borderRadius: 'var(--iv-radius-sm)', border: '1px solid var(--iv-border-subtle)', fontSize: '12px', color: 'var(--iv-text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Tally configuration parameters (tally.ini) protected with user Modify rights and Superclient Full Control.</span>
                  <span style={{ fontFamily: 'var(--iv-font-mono)', fontSize: '11px', color: 'var(--iv-text-primary)' }}>Integrity Verified</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 3. ARCHITECTURE & ZERO-TRUST ISOLATION SECTION */}
      <section id="architecture" className="iv-section">
        <div className="iv-container">
          <div style={{ textAlign: 'center' }}>
            <div className="iv-section-label">Architecture</div>
            <h2 className="iv-section-title">Zero-Trust NTFS sandboxing for every client.</h2>
            <p className="iv-section-subhead">
              Conventional VPS providers lump multiple companies into a single shared folder structure. Innovation VPS assigns every firm an independent drive letter with strict Access Control Lists.
            </p>
          </div>

          <div className="iv-editorial-grid">
            <div className="iv-editorial-text">
              <h3>Never risk cross-company data exposure.</h3>
              <p>
                When a staff member or client user logs into their Tally workspace, Windows NTFS inheritance permits access only to their assigned drive letter. System directories, other company data, and administrative tools return access denied.
              </p>
              <p>
                Configuration parameters are applied automatically on user provisioning. Tally.ini files are configured once with exact data paths, language libraries, and TDL files, while allowing authorized accountants to adjust their data preferences without administrative intervention.
              </p>

              <ul className="iv-fact-list">
                <li className="iv-fact-item">
                  <span className="iv-fact-bullet" />
                  <span><strong>Dedicated Drive Partitions:</strong> Drive letters E through V mapped individually per organization.</span>
                </li>
                <li className="iv-fact-item">
                  <span className="iv-fact-bullet" />
                  <span><strong>Inheritance Lockdown:</strong> Standard users cannot list, traverse, or discover sibling client volumes.</span>
                </li>
                <li className="iv-fact-item">
                  <span className="iv-fact-bullet" />
                  <span><strong>Superclient Administrative Control:</strong> Centralized administration retaining audit and maintenance rights.</span>
                </li>
              </ul>
            </div>

            <div className="iv-graphic-box">
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--iv-text-secondary)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Storage Access Control Matrix
              </div>

              <div className="iv-architecture-row isolated">
                <div>
                  <div className="iv-arch-label">Volume K:\ (Durga Metal Industries)</div>
                  <div className="iv-arch-desc">User: ved | Rights: Modify, Read, Execute</div>
                </div>
                <span className="iv-arch-pill" style={{ color: '#1B5E20', backgroundColor: '#E8F5E9', borderColor: '#A5D6A7' }}>Granted</span>
              </div>

              <div className="iv-architecture-row">
                <div>
                  <div className="iv-arch-label">Volume L:\ (Ecoguard Technologies)</div>
                  <div className="iv-arch-desc">User: ved attempts traversal</div>
                </div>
                <span className="iv-arch-pill" style={{ color: '#C62828', backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' }}>Access Denied</span>
              </div>

              <div className="iv-architecture-row">
                <div>
                  <div className="iv-arch-label">Volume C:\Windows & C:\Users</div>
                  <div className="iv-arch-desc">Standard Users security group</div>
                </div>
                <span className="iv-arch-pill" style={{ color: '#C62828', backgroundColor: '#FFEBEE', borderColor: '#FFCDD2' }}>Execute Locked</span>
              </div>

              <div className="iv-architecture-row">
                <div>
                  <div className="iv-arch-label">Superclient Global Overseer</div>
                  <div className="iv-arch-desc">Backup and node migration operator</div>
                </div>
                <span className="iv-arch-pill" style={{ color: 'var(--iv-accent)', backgroundColor: 'var(--iv-accent-subtle)', borderColor: 'var(--iv-accent)' }}>Full Control</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. SUB-SECOND RDS SESSION ASSISTANCE SECTION */}
      <section id="shadow-assist" className="iv-section">
        <div className="iv-container">
          <div className="iv-editorial-grid" style={{ direction: 'rtl' }}>
            <div className="iv-editorial-text" style={{ direction: 'ltr' }}>
              <div className="iv-section-label">Live Support</div>
              <h3>Sub-second Remote Desktop Session Shadowing.</h3>
              <p>
                Resolve accounting bottlenecks immediately. When an accountant encounters an entry discrepancy or voucher error, administrators can view or control their screen in real time using native Windows Remote Desktop protocol.
              </p>
              <p>
                Eliminates the latency, security vulnerabilities, and subscription costs of third-party remote desktop software. With Group Policy Level 2 configured on every node, support sessions connect in milliseconds without disruptive consent prompts.
              </p>

              <ul className="iv-fact-list">
                <li className="iv-fact-item">
                  <span className="iv-fact-bullet" />
                  <span><strong>Zero External Agents:</strong> Powered by native Windows Terminal Services (mstsc.exe).</span>
                </li>
                <li className="iv-fact-item">
                  <span className="iv-fact-bullet" />
                  <span><strong>Dual Modes:</strong> View Only inspection or Full Control mouse and keyboard assistance.</span>
                </li>
                <li className="iv-fact-item">
                  <span className="iv-fact-bullet" />
                  <span><strong>Direct Exit:</strong> Instant disconnect with keyboard shortcut Ctrl + Shift + * or closing the window.</span>
                </li>
              </ul>
            </div>

            <div className="iv-graphic-box" style={{ direction: 'ltr' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--iv-text-secondary)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Native Shadow Execution
              </div>

              <div style={{ backgroundColor: 'var(--iv-surface-subtle)', padding: '16px', borderRadius: 'var(--iv-radius-sm)', border: '1px solid var(--iv-border)', fontFamily: 'var(--iv-font-mono)', fontSize: '13px', lineHeight: '1.6', color: 'var(--iv-text-primary)', marginBottom: '16px' }}>
                <div style={{ color: 'var(--iv-text-tertiary)', fontSize: '11px', marginBottom: '4px' }}># View live user screen without consent lag</div>
                <div>mstsc /shadow:39 /noConsentPrompt</div>
                <div style={{ color: 'var(--iv-text-tertiary)', fontSize: '11px', margin: '10px 0 4px' }}># Or provide interactive mouse and keyboard assistance</div>
                <div>mstsc /shadow:39 /control /noConsentPrompt</div>
              </div>

              <div style={{ fontSize: '13px', color: 'var(--iv-text-secondary)', lineHeight: '1.5' }}>
                Verified policy compliance ensures the Shadow registry key is active on all operational nodes, enabling instantaneous diagnostic sessions.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SPECIFICATIONS TABLE */}
      <section id="specifications" className="iv-section">
        <div className="iv-container">
          <div style={{ textAlign: 'center' }}>
            <div className="iv-section-label">Technical Standards</div>
            <h2 className="iv-section-title">Specifications built for reliability.</h2>
            <p className="iv-section-subhead">
              Every Innovation VPS node is built with datacenter-grade hardware and monitored around the clock through our telemetry pipe.
            </p>
          </div>

          <div className="iv-specs-table">
            <div className="iv-specs-row">
              <div className="iv-specs-key">Compute Architecture</div>
              <div className="iv-specs-val">Multi-core AMD EPYC and Intel Xeon high-frequency enterprise processors with dedicated CPU allocation per multi-user node.</div>
            </div>
            <div className="iv-specs-row">
              <div className="iv-specs-key">Memory Standard</div>
              <div className="iv-specs-val">DDR4 ECC Registered RAM preventing memory corruption during heavy concurrent Tally Prime Edit Log batch operations.</div>
            </div>
            <div className="iv-specs-row">
              <div className="iv-specs-key">Storage Architecture</div>
              <div className="iv-specs-val">Enterprise PCIe NVMe SSDs in hardware RAID configurations delivering over 3,500 MB/s sequential read and write speeds.</div>
            </div>
            <div className="iv-specs-row">
              <div className="iv-specs-key">Tally Compatibility</div>
              <div className="iv-specs-val">TallyPrime 1.0 through 7.2, TallyPrime Edit Log, Tally.ERP 9, custom TCP / TDL modules, and automated ODBC port binding.</div>
            </div>
            <div className="iv-specs-row">
              <div className="iv-specs-key">Network & Latency</div>
              <div className="iv-specs-val">Tier-4 datacenter routing across Mumbai, Delhi NCR, and Bengaluru hubs with sub-25 millisecond response times across India.</div>
            </div>
            <div className="iv-specs-row">
              <div className="iv-specs-key">Backup Architecture</div>
              <div className="iv-specs-val">Daily snapshot snapshots and secondary drive incremental state buffers (IncrState.1800) with 1024 MB buffer limits.</div>
            </div>
            <div className="iv-specs-row">
              <div className="iv-specs-key">Operational SLA</div>
              <div className="iv-specs-val">99.95% infrastructure uptime guarantee with automated node failover and 24/7 administrative oversight.</div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. DEPLOYMENT ACCESS FORM */}
      <section id="deploy" className="iv-section">
        <div className="iv-container">
          <div style={{ textAlign: 'center' }}>
            <div className="iv-section-label">Get Started</div>
            <h2 className="iv-section-title">Request your dedicated workspace.</h2>
            <p className="iv-section-subhead">
              Provide your team specifications below. Our engineering team provisions your sandboxed drive and delivers RemoteApp access credentials within two business hours.
            </p>
          </div>

          <div className="iv-form-card">
            {submitSuccess ? (
              <div className="iv-alert-success">
                <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '6px' }}>Deployment Request Received</div>
                <div>Thank you, {formState.contactName || 'Valued Client'}. Our technical team is preparing your sandboxed drive configuration and will reach out to <strong>{formState.phone}</strong> shortly.</div>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} noValidate>
                <div className="iv-form-context">
                  <div>
                    <div className="iv-form-eyebrow">A clearer start</div>
                    <h3>Tell us what your team needs.</h3>
                    <p>We use these details to recommend the right workspace size before provisioning begins.</p>
                  </div>
                  <ol className="iv-form-steps" aria-label="Deployment request process">
                    <li><span>1</span> Submit your workspace requirements</li>
                    <li><span>2</span> Confirm the right node and access plan</li>
                    <li><span>3</span> Receive setup details from our team</li>
                  </ol>
                </div>

                {formError && (
                  <div role="alert" aria-live="assertive" style={{ backgroundColor: '#FFEBEE', border: '1px solid #FFCDD2', color: '#C62828', padding: '10px 14px', borderRadius: 'var(--iv-radius-sm)', fontSize: '13px', marginBottom: '18px' }}>
                    {formError}
                  </div>
                )}

                <div className="iv-form-grid">
                  <div className="iv-form-group">
                    <label className="iv-label" htmlFor="companyName">Firm or Company Name *</label>
                    <input
                      id="companyName"
                      name="companyName"
                      type="text"
                      className="iv-input"
                      placeholder="e.g. S.K. Sharma & Associates"
                      value={formState.companyName}
                      onChange={handleInputChange}
                      autoComplete="organization"
                      required
                    />
                  </div>

                  <div className="iv-form-group">
                    <label className="iv-label" htmlFor="contactName">Contact Person Name</label>
                    <input
                      id="contactName"
                      name="contactName"
                      type="text"
                      className="iv-input"
                      placeholder="e.g. Rajesh Kumar"
                      value={formState.contactName}
                      onChange={handleInputChange}
                      autoComplete="name"
                    />
                  </div>

                  <div className="iv-form-group">
                    <label className="iv-label" htmlFor="phone">Mobile / WhatsApp Number *</label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      className="iv-input"
                      placeholder="e.g. 9876543210"
                      value={formState.phone}
                      onChange={handleInputChange}
                      inputMode="tel"
                      autoComplete="tel"
                      required
                    />
                  </div>

                  <div className="iv-form-group">
                    <label className="iv-label" htmlFor="email">Email Address</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      className="iv-input"
                      placeholder="e.g. accounts@firm.in"
                      value={formState.email}
                      onChange={handleInputChange}
                      autoComplete="email"
                    />
                  </div>

                  <div className="iv-form-group">
                    <label className="iv-label" htmlFor="userCount">Concurrent Users</label>
                    <select
                      id="userCount"
                      name="userCount"
                      className="iv-select"
                      value={formState.userCount}
                      onChange={handleInputChange}
                    >
                      <option value="2">2 Users (Small Office)</option>
                      <option value="5">5 Users (Standard Practice)</option>
                      <option value="10">10 Users (Growing Firm)</option>
                      <option value="20">20 Users (Corporate Team)</option>
                      <option value="30">30+ Users (Enterprise Tier)</option>
                    </select>
                  </div>

                  <div className="iv-form-group">
                    <label className="iv-label" htmlFor="storageGB">Dedicated Storage</label>
                    <select
                      id="storageGB"
                      name="storageGB"
                      className="iv-select"
                      value={formState.storageGB}
                      onChange={handleInputChange}
                    >
                      <option value="25">25 GB Enterprise NVMe</option>
                      <option value="50">50 GB Enterprise NVMe</option>
                      <option value="100">100 GB Enterprise NVMe</option>
                      <option value="250">250 GB Enterprise NVMe</option>
                    </select>
                  </div>

                  <div className="iv-form-group full">
                    <label className="iv-label" htmlFor="notes">Additional Requirements (Optional)</label>
                    <input
                      id="notes"
                      name="notes"
                      type="text"
                      className="iv-input"
                      placeholder="e.g. Need TDL custom integration or specific TallyPrime version"
                      value={formState.notes}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <button
                    type="submit"
                    className="iv-btn iv-btn-primary iv-btn-lg"
                    style={{ width: '100%' }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Submitting Request...' : 'Deploy My Dedicated Workspace'}
                  </button>
                </div>

                <div className="iv-form-notice">
                  By submitting this request, you agree to our standard data privacy practices. We never inspect or access client financial databases.
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* 7. FOOTER */}
      <footer className="iv-footer">
        <div className="iv-container">
          <div className="iv-footer-notes">
            Tally and TallyPrime are registered trademarks of Tally Solutions Pvt. Ltd. Innovation VPS provides independent cloud infrastructure and hosting operations for authorized Tally license holders.
          </div>

          <div className="iv-footer-grid">
            <div className="iv-footer-col">
              <h4>Innovation VPS</h4>
              <p style={{ margin: 0, lineHeight: '1.6', color: 'var(--iv-text-secondary)' }}>
                Enterprise Cloud Infrastructure and High-Performance Remote Desktop Hosting for accounting firms across India.
              </p>
              <div style={{ marginTop: '14px' }}>
                <button type="button" className="iv-btn iv-btn-secondary" onClick={onOpenLogin} style={{ fontSize: '12px', padding: '4px 12px' }}>
                  Staff Portal Sign In
                </button>
              </div>
            </div>

            <div className="iv-footer-col">
              <h4>Infrastructure</h4>
              <ul>
                <li><a href="#architecture" onClick={(e) => { e.preventDefault(); scrollToSection('architecture'); }}>NTFS Drive Isolation</a></li>
                <li><a href="#shadow-assist" onClick={(e) => { e.preventDefault(); scrollToSection('shadow-assist'); }}>Session Shadow Assist</a></li>
                <li><a href="#specifications" onClick={(e) => { e.preventDefault(); scrollToSection('specifications'); }}>Hardware Specifications</a></li>
                <li><a href="#deploy" onClick={(e) => { e.preventDefault(); scrollToSection('deploy'); }}>Dedicated Volumes</a></li>
              </ul>
            </div>

            <div className="iv-footer-col">
              <h4>Operations</h4>
              <ul>
                <li><a href="#deploy" onClick={(e) => { e.preventDefault(); scrollToSection('deploy'); }}>Deploy Workspace</a></li>
                <li><button type="button" className="iv-legal-btn" onClick={onOpenPortal}>Client Self-Service Portal</button></li>
                <li><button type="button" className="iv-legal-btn" onClick={onOpenLogin}>Administrative Sign In</button></li>
              </ul>
            </div>

            <div className="iv-footer-col">
              <h4>Governance</h4>
              <ul>
                <li><button type="button" className="iv-legal-btn" onClick={() => setModalType('terms')}>Terms of Service</button></li>
                <li><button type="button" className="iv-legal-btn" onClick={() => setModalType('privacy')}>Privacy Policy</button></li>
                <li><button type="button" className="iv-legal-btn" onClick={() => scrollToSection('specifications')}>Security Overview</button></li>
              </ul>
            </div>
          </div>

          <div className="iv-footer-bottom">
            <div>
              Copyright &copy; {new Date().getFullYear()} Innovation Web Works. All rights reserved.
            </div>
            <div className="iv-legal-links">
              <button type="button" className="iv-legal-btn" onClick={() => setModalType('privacy')}>Privacy Policy</button>
              <span>|</span>
              <button type="button" className="iv-legal-btn" onClick={() => setModalType('terms')}>Terms of Service</button>
              <span>|</span>
              <span>ISO & Indian IT Act Compliant Hosting</span>
            </div>
          </div>
        </div>
      </footer>

      {/* 8. TERMS OF SERVICE MODAL (REAL DATA PRACTICES DRAFT) */}
      {modalType === 'terms' && (
        <div className="iv-modal-backdrop" onClick={() => setModalType(null)} role="dialog" aria-modal="true">
          <div className="iv-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="iv-modal-head">
              <h3>Terms of Service (Draft for Review)</h3>
              <button type="button" className="iv-modal-close" onClick={() => setModalType(null)} aria-label="Close modal">
                <IconClose />
              </button>
            </div>
            <div className="iv-modal-body">
              <p><strong>Last Updated: October 2026</strong></p>
              <h4>1. Service Provisioning and Scope</h4>
              <p>
                Innovation VPS provides managed Windows Server virtual private server infrastructure configured for Tally Prime and RemoteApp operations. The client is solely responsible for procuring valid Tally software licenses from Tally Solutions Pvt. Ltd.
              </p>
              <h4>2. Zero-Trust Storage Sandboxing</h4>
              <p>
                Client data is stored on dedicated, sandboxed drive partitions with NTFS Access Control Lists. The client receives exclusive access credentials. Innovation VPS guarantees that standard users assigned to one client volume cannot access, inspect, or traverse data directories belonging to other clients.
              </p>
              <h4>3. Backup and Data Preservation</h4>
              <p>
                While automated snapshot and incremental buffer backups are maintained, clients are advised to maintain independent local periodic exports. Innovation VPS does not modify or delete client data without written authorization.
              </p>
              <h4>4. Session Shadowing and Technical Support</h4>
              <p>
                Remote Desktop Session Shadowing is utilized exclusively for client-requested troubleshooting and maintenance assistance. All administrative access events are logged in immutable system audit trails.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 9. PRIVACY POLICY MODAL (REAL DATA PRACTICES DRAFT) */}
      {modalType === 'privacy' && (
        <div className="iv-modal-backdrop" onClick={() => setModalType(null)} role="dialog" aria-modal="true">
          <div className="iv-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="iv-modal-head">
              <h3>Privacy Policy (Draft for Review)</h3>
              <button type="button" className="iv-modal-close" onClick={() => setModalType(null)} aria-label="Close modal">
                <IconClose />
              </button>
            </div>
            <div className="iv-modal-body">
              <p><strong>Last Updated: October 2026</strong></p>
              <h4>1. Data Confidentiality Commitment</h4>
              <p>
                Innovation VPS treats all client accounting records, financial databases, company configurations, and credentials as strictly confidential. Our systems do not inspect, index, or analyze client financial figures.
              </p>
              <h4>2. Telemetry and Operational Monitoring</h4>
              <p>
                Telemetry transmitted from virtual machine nodes to our management portal includes exclusively hardware metrics (CPU utilization, RAM consumption, disk health) and active session counts required for uptime preservation. No financial voucher data is collected.
              </p>
              <h4>3. Regulatory Compliance</h4>
              <p>
                Our infrastructure practices align with the Information Technology Act of India and prevailing data protection guidelines. Data remains housed within Indian datacenters unless expressly requested otherwise by enterprise contracts.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
