/**
 * METIS Synthetic Dataset Generator - Phase 3
 * Generate realistic 10M+ customer datasets for scale testing
 */

export interface Customer {
  customerId: string;
  segment: string;
  tenure: number;
  ltv: number;
  active: boolean;
  churnRisk: number;
}

export interface Decision {
  decisionId: string;
  customerId: string;
  timestamp: string;
  action: string;
  outcome: boolean;
  channel: string;
}

/**
 * Generate synthetic customer population (Phase 3: 10M+)
 */
export function generateCustomers(count: number): Customer[] {
  const customers: Customer[] = [];
  const segments = ['premium', 'standard', 'budget'];

  for (let i = 0; i < count; i++) {
    const segment = segments[i % segments.length];
    const tenure = Math.floor(Math.random() * 120); // 0-120 months
    const baseLTV = segment === 'premium' ? 5000 : segment === 'standard' ? 2000 : 500;
    const ltv = baseLTV * (1 + tenure / 60); // Increases with tenure

    customers.push({
      customerId: `cust_${String(i).padStart(10, '0')}`,
      segment,
      tenure,
      ltv,
      active: Math.random() > 0.2, // 80% active
      churnRisk: Math.random() * (tenure < 12 ? 0.4 : 0.1), // Higher for new customers
    });
  }

  return customers;
}

/**
 * Generate synthetic interaction history (Phase 3: 24M+ interactions)
 */
export function generateInteractionHistory(
  customers: Customer[],
  decisionsPerCustomer: number = 100
): Decision[] {
  const decisions: Decision[] = [];
  const actions = ['upgrade', 'discount', 'support', 'cross-sell', 'none'];
  const channels = ['web', 'app', 'email', 'sms', 'push'];

  let decisionId = 0;

  for (const customer of customers) {
    for (let i = 0; i < decisionsPerCustomer; i++) {
      const action = actions[Math.floor(Math.random() * actions.length)];
      // Outcome correlated with LTV and action relevance
      const baseOutcomeRate = customer.ltv / 5000;
      const actionBoost = action === 'upgrade' ? 0.2 : action === 'discount' ? 0.15 : 0;
      const outcome = Math.random() < baseOutcomeRate + actionBoost;

      decisions.push({
        decisionId: `dec_${String(decisionId++).padStart(10, '0')}`,
        customerId: customer.customerId,
        timestamp: new Date(
          Date.now() - Math.random() * 24 * 30 * 60 * 60 * 1000
        ).toISOString(), // Last 30 days
        action,
        outcome,
        channel: channels[Math.floor(Math.random() * channels.length)],
      });
    }
  }

  return decisions;
}

/**
 * Generate realistic skew (Pareto distribution)
 * 80% of value from 20% of customers (typical telco pattern)
 */
export function applyParetoSkew(customers: Customer[]): Customer[] {
  // Sort by LTV
  customers.sort((a, b) => b.ltv - a.ltv);

  // Top 20% get 80% of "high-value" treatment
  const top20 = Math.ceil(customers.length * 0.2);
  for (let i = 0; i < top20; i++) {
    customers[i].segment = 'premium';
    customers[i].ltv *= 2;
  }

  return customers;
}

/**
 * Add seasonality to interaction history
 */
export function addSeasonality(decisions: Decision[]): Decision[] {
  return decisions.map((d) => {
    const date = new Date(d.timestamp);
    const month = date.getMonth();

    // Peak during holiday season (Nov-Dec) and summer (Jun-Jul)
    const isSeason = [11, 12, 5, 6].includes(month);
    if (isSeason && Math.random() > 0.1) {
      // 90% of holiday decisions get better outcomes
      d.outcome = true;
    }

    return d;
  });
}

/**
 * Generate Phase 3 dataset
 */
export function generatePhase3Dataset(customerCount: number = 1000000): {
  customers: Customer[];
  decisions: Decision[];
  metadata: { timestamp: string; customerCount: number; decisionCount: number };
} {
  console.log(`Generating synthetic dataset: ${customerCount.toLocaleString()} customers...`);

  const startTime = Date.now();

  // Generate customers
  let customers = generateCustomers(customerCount);
  customers = applyParetoSkew(customers);

  // Generate decisions
  const decisions = generateInteractionHistory(customers, 100);
  addSeasonality(decisions);

  const duration = (Date.now() - startTime) / 1000;
  console.log(`✓ Generated ${customerCount.toLocaleString()} customers and ${decisions.length.toLocaleString()} decisions in ${duration.toFixed(1)}s`);

  return {
    customers,
    decisions,
    metadata: {
      timestamp: new Date().toISOString(),
      customerCount,
      decisionCount: decisions.length,
    },
  };
}
