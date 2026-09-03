/**
 * METIS Adaptive Models - Online Learning with Auto-Binning
 * Phase 1: Highest-priority parity gap
 */

export interface AdaptiveModelConfig {
  id: string;
  type: 'binned-logistic' | 'binned-linear';
  autoBinning: boolean;
  binCount: number;
  coldStartScore: number;
  driftThreshold: number;
}

export interface ModelPrediction {
  score: number;
  confidence: number;
  topFeatures: Array<{ name: string; importance: number }>;
  modelVersion: string;
}

export interface BinStats {
  lower: number;
  upper: number;
  count: number;
  positives: number;
  negativeScore: number;
}

/**
 * Adaptive model that learns online from outcomes
 */
export class AdaptiveModel {
  private config: AdaptiveModelConfig;
  private bins: Map<string, BinStats> = new Map();
  private version = '1.0.0';
  private totalObservations = 0;

  constructor(config: AdaptiveModelConfig) {
    this.config = config;
  }

  /**
   * Score a candidate with the adaptive model
   */
  async score(features: Record<string, number>): Promise<ModelPrediction> {
    // Phase 1: Simple binned model
    // Score = average positive rate in matching bin
    const binKey = this.getBinKey(features);
    const bin = this.bins.get(binKey);

    const score = bin
      ? bin.positives / Math.max(1, bin.count)
      : this.config.coldStartScore;

    return {
      score: Math.min(1, Math.max(0, score)),
      confidence: bin ? Math.min(1, bin.count / 100) : 0.3, // Confidence grows with sample size
      topFeatures: Object.entries(features)
        .slice(0, 3)
        .map(([name, value]) => ({ name, importance: Math.abs(value) })),
      modelVersion: this.version,
    };
  }

  /**
   * Record an outcome to update the model
   */
  recordOutcome(features: Record<string, number>, outcome: boolean): void {
    const binKey = this.getBinKey(features);

    if (!this.bins.has(binKey)) {
      const mainFeature = Object.entries(features)[0];
      this.bins.set(binKey, {
        lower: mainFeature?.[1] ?? 0,
        upper: (mainFeature?.[1] ?? 0) + 0.1,
        count: 0,
        positives: 0,
        negativeScore: 0.5,
      });
    }

    const bin = this.bins.get(binKey)!;
    bin.count++;
    if (outcome) bin.positives++;
    this.totalObservations++;

    // Drift detection: if bin diverges, mark for retraining
    this.checkDrift(bin);
  }

  /**
   * Check for model drift
   */
  private checkDrift(bin: BinStats): void {
    const currentRate = bin.positives / bin.count;
    const expectedRate = 0.5; // Neutral expectation
    const drift = Math.abs(currentRate - expectedRate);

    if (drift > this.config.driftThreshold) {
      // Phase 1: Signal drift; Phase 3 auto-retrains
      console.warn(`Drift detected in bin: expected ${expectedRate}, got ${currentRate}`);
    }
  }

  /**
   * Get bin key for a set of features (simple bucketing)
   */
  private getBinKey(features: Record<string, number>): string {
    const mainFeature = Object.values(features)[0] ?? 0;
    const bin = Math.floor(mainFeature * 10) / 10;
    return `bin_${bin.toFixed(1)}`;
  }

  /**
   * Get model metrics
   */
  getMetrics() {
    return {
      version: this.version,
      totalObservations: this.totalObservations,
      binCount: this.bins.size,
      driftDetected: Array.from(this.bins.values()).some(
        (b) => Math.abs(b.positives / b.count - 0.5) > this.config.driftThreshold
      ),
    };
  }

  /**
   * Export model state for persistence (Phase 1)
   */
  export() {
    return {
      config: this.config,
      bins: Object.fromEntries(this.bins),
      version: this.version,
      totalObservations: this.totalObservations,
    };
  }

  /**
   * Import model state
   */
  static import(data: any) {
    const model = new AdaptiveModel(data.config);
    model.bins = new Map(Object.entries(data.bins));
    model.version = data.version;
    model.totalObservations = data.totalObservations;
    return model;
  }
}

/**
 * Model registry for online-learning models
 */
export class AdaptiveModelRegistry {
  private models: Map<string, AdaptiveModel> = new Map();

  register(id: string, model: AdaptiveModel): void {
    this.models.set(id, model);
  }

  get(id: string): AdaptiveModel | undefined {
    return this.models.get(id);
  }

  getAll(): Map<string, AdaptiveModel> {
    return this.models;
  }

  /**
   * Record outcome for a model
   */
  recordOutcome(modelId: string, features: Record<string, number>, outcome: boolean): void {
    const model = this.models.get(modelId);
    if (model) {
      model.recordOutcome(features, outcome);
    }
  }
}

// Global registry
export const adaptiveModelRegistry = new AdaptiveModelRegistry();
