import type { VaultIntelligenceReport } from './vault-types.ts';

export const VAULT_PRESETS: VaultIntelligenceReport[] = [
  {
    id: 'research-microgrid-2026',
    title: 'RESEARCH BRIEF: Microgrid Decentralized Energy Dispatch — 2026 Load Forecasting Model',
    category: 'research-brief',
    classification: 'RESTRICTED',
    severityOrRating: 'CONFIDENTIAL RESEARCH',
    author: 'GridDynamics Energy Labs',
    timestamp: '2026-11-24T08:30:00Z',
    priceCkb: '1',
    previewTeaser:
      'A technical research brief analyzing high-penetration renewable microgrids with distributed storage. Synthesizes hourly demand data across 1,200 grid sensors and demonstrates an autonomous dispatch algorithm.\n\n- Scope: Sub-hourly dispatch optimization under variable solar and wind profiles.\n- Methodology: Convex relaxation of power flow equations with quadratic battery degradation cost.\n- Target Audience: Infrastructure operators and power systems engineers.',
    classifiedPayload: `## MICROGRID DISPATCH OPTIMIZATION MODEL

### Executive Summary
The primary challenge in microgrid balance is coordinating multi-battery storage systems against intermittent distributed solar generation. This brief provides the complete formulation and parameters for optimal unit commitment.

---

### MATHEMATICAL FORMULATION
The objective function minimizes total generation and degradation cost over a 24-hour horizon:

\`\`\`text
minimize sum_{t=1}^24 [ C_grid(P_grid,t) + sum_{i=1}^M ( C_gen,i(P_i,t) + C_deg,i(P_bat,i,t) ) ]

subject to:
  sum P_gen,t + sum P_bat,t + P_grid,t = P_load,t  (Power balance)
  SOC_min,i <= SOC_i,t <= SOC_max,i                (Battery limits)
  P_line,k,t <= P_line_max,k                       (Transmission constraints)
\`\`\`

---

### SIMULATION DISPATCH ENGINE (PYTHON)
\`\`\`python
import numpy as np

def compute_dispatch(load_profile, pv_forecast, battery_capacity_kwh=100.0):
    timesteps = len(load_profile)
    battery_soc = np.zeros(timesteps + 1)
    battery_soc[0] = 0.50  # Initial 50% state of charge
    grid_import = np.zeros(timesteps)
    
    for t in range(timesteps):
        net_demand = load_profile[t] - pv_forecast[t]
        if net_demand > 0:
            # Deficit: discharge battery if above minimum threshold
            discharge = min(net_demand, (battery_soc[t] - 0.20) * battery_capacity_kwh)
            battery_soc[t + 1] = battery_soc[t] - (discharge / battery_capacity_kwh)
            grid_import[t] = net_demand - discharge
        else:
            # Surplus: charge battery up to max capacity
            charge = min(abs(net_demand), (0.95 - battery_soc[t]) * battery_capacity_kwh)
            battery_soc[t + 1] = battery_soc[t] + (charge / battery_capacity_kwh)
            grid_import[t] = 0.0
            
    return grid_import, battery_soc
\`\`\`

---

### HOURLY FORECAST BENCHMARK
| Hour (UTC) | Base Load (kW) | Solar PV (kW) | Net Load (kW) | Battery Dispatch (kW) |
|:---|:---:|:---:|:---:|:---:|
| 08:00 | 142.5 | 45.2 | +97.3 | +32.0 (Discharge) |
| 12:00 | 185.0 | 210.4 | -25.4 | -25.4 (Charge) |
| 18:00 | 220.1 | 18.0 | +202.1 | +55.0 (Discharge) |
| 22:00 | 110.4 | 0.0 | +110.4 | +20.0 (Discharge) |`,
    attachmentFileName: 'Microgrid-Dispatch-Parameters-2026.csv',
    attachmentData: 'Hour,BaseLoadKW,SolarPVKW,BatteryCapacityKWh\n8,142.5,45.2,100\n12,185.0,210.4,100\n18,220.1,18.0,100\n22,110.4,0.0,100',
  },
  {
    id: 'macro-alpha-2026-q4',
    title: 'INFRASTRUCTURE REPORT: Sovereign CKB Staking & Layer-2 Payment Velocity Model',
    category: 'macro-analysis',
    classification: 'CONFIDENTIAL',
    severityOrRating: 'HIGH ALPHA · TIER-1',
    author: 'QuantVault Capital Research',
    timestamp: '2026-11-24T06:15:00Z',
    priceCkb: '1',
    previewTeaser:
      'An econometric analysis of the CKB halving supply dynamics combined with Fiber Network off-chain liquidity velocity. Forecasts channel capital demand as Layer-1 settlement fees rise.\n\n- Target Horizon: 6 to 18 months.\n- Primary Metric: Inbound routing yield vs. Layer-1 base issuance.',
    classifiedPayload: `## INSTITUTIONAL ANALYSIS: CKB FIBER INFRASTRUCTURE

### Quantitative Strategy Breakdown
1. **Asymmetric Liquidity Provisioning**: Deploying channel capital across high-traffic Fiber routing nodes generates a risk-adjusted return surpassing traditional PoS staking:
   - Base Layer Yield (NervosDAO): ~3.1% APR
   - Channel Velocity Multiplier: 4.8x turnover / month
   - Effective Routing Fee Yield: 14.8% APR net of rebalancing costs

2. **Optimal Channel Topology Parameters**:
   - Optimal Channel Size: 10,000 - 50,000 CKB per peer
   - Recommended Buffer: 20% remote reserve to absorb peak transaction bursts
   - Auto-rebalance trigger: TLC imbalance ratio > 0.72

---

### ALGORITHMIC REBALANCING SPECIFICATION
\`\`\`python
# Fiber Dynamic Routing Fee Optimization
def calculate_optimal_fee_rate(local_balance, remote_balance, base_rate=250):
    total_capacity = local_balance + remote_balance
    if total_capacity == 0:
        return base_rate
    imbalance = (local_balance - remote_balance) / total_capacity
    # Skew fee upwards when local liquidity is depleted
    fee_skew = math.exp(-2.5 * imbalance)
    return int(base_rate * fee_skew)
\`\`\`

---

### ASSET ALLOCATION MATRIX
| Asset / Strategy | Weight | Target APY | Max Drawdown Target |
|:---|:---:|:---:|:---:|
| NervosDAO Cold Storage | 45% | 3.1% | 0.0% (Native CKB) |
| Fiber Routing Node Pool | 35% | 14.8% | 1.2% (Channel fees) |
| Hedged Delta-Neutral Basis | 20% | 8.4% | 0.5% |`,
    attachmentFileName: 'QuantVault-Alpha-Model-Q4-2026.csv',
    attachmentData: 'Strategy,Weight,TargetAPY,Drawdown\nNervosDAO,0.45,0.031,0.0\nFiberRouting,0.35,0.148,0.012\nBasisHedge,0.20,0.084,0.005',
  },
  {
    id: 'design-tokens-v2',
    title: 'DESIGN SYSTEM: Enterprise Web3 Component & Design Token Package',
    category: 'design-tokens',
    classification: 'UNCLASSIFIED',
    severityOrRating: 'PRODUCTION ASSET',
    author: 'StudioZero Design Architecture',
    timestamp: '2026-11-24T04:00:00Z',
    priceCkb: '1',
    previewTeaser:
      'A comprehensive design token package providing structured dark-mode themes, typography scales, spacing grids, and component tokens for high-density financial and blockchain interfaces.\n\n- Standards: W3C Design Tokens Community Group specification.\n- Compatibility: Tailwind CSS v4, CSS Custom Properties, Figma Token Studio.',
    classifiedPayload: `## DESIGN TOKEN SPECIFICATION (V2.4)

### Color Palette (Dark Theme Core)
\`\`\`json
{
  "color": {
    "background": {
      "primary": { "value": "#080a0f", "type": "color" },
      "secondary": { "value": "#0d121c", "type": "color" },
      "card": { "value": "#121927", "type": "color" },
      "cardHover": { "value": "#172235", "type": "color" }
    },
    "brand": {
      "emerald": { "value": "#10b981", "type": "color" },
      "green": { "value": "#34d399", "type": "color" },
      "cyan": { "value": "#06b6d4", "type": "color" },
      "amber": { "value": "#f59e0b", "type": "color" }
    },
    "text": {
      "main": { "value": "#f1f5f9", "type": "color" },
      "muted": { "value": "#94a3b8", "type": "color" },
      "dim": { "value": "#64748b", "type": "color" }
    }
  }
}
\`\`\`

---

### TYPOGRAPHY & SPACING SYSTEM
\`\`\`css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}
\`\`\``,
    attachmentFileName: 'Enterprise-Design-Tokens-v2.json',
    attachmentData: '{"name":"EnterpriseTokens","version":"2.4.0","tokens":{"primary":"#10b981"}}',
  },
];
