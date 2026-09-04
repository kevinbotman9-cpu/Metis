/**
 * Approval Workflow - Phase 1
 * Change request management with tier-based autonomy
 */

import { v4 as uuid } from 'uuid';

export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'active' | 'rolled_back';
export type AutonomyTier = 1 | 2 | 3;

export interface ChangeRequest {
  id: string;
  artifactId: string;
  version: string;
  createdBy: string;
  createdAt: string;
  status: ApprovalStatus;
  autonomyTier: AutonomyTier;
  reason: string;
  proposedChanges: Record<string, any>;
  simulationResult?: Record<string, any>;
  biasCheckPassed?: boolean;
  approvals: Array<{ approvedBy: string; approvedAt: string }>;
  rejections: Array<{ rejectedBy: string; rejectedAt: string; reason: string }>;
}

/**
 * Approval workflow engine
 */
export class ApprovalWorkflow {
  private requests: Map<string, ChangeRequest> = new Map();

  /**
   * Submit a change request
   */
  submitRequest(
    artifactId: string,
    version: string,
    createdBy: string,
    autonomyTier: AutonomyTier,
    reason: string,
    proposedChanges: Record<string, any>
  ): ChangeRequest {
    const request: ChangeRequest = {
      id: uuid(),
      artifactId,
      version,
      createdBy,
      createdAt: new Date().toISOString(),
      status: 'draft',
      autonomyTier,
      reason,
      proposedChanges,
      approvals: [],
      rejections: [],
    };

    this.requests.set(request.id, request);
    return request;
  }

  /**
   * Publish draft for approval
   */
  publishForApproval(requestId: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'draft') return false;

    request.status = 'pending';
    return true;
  }

  /**
   * Approve a request (Tier 1: always requires approval; Tier 2: auto if within bounds; Tier 3: auto if simulation passes)
   */
  approve(requestId: string, approvedBy: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'pending') return false;

    request.approvals.push({
      approvedBy,
      approvedAt: new Date().toISOString(),
    });

    // Tier-based logic
    if (request.autonomyTier === 1) {
      // Always requires explicit approval
      if (request.approvals.length >= 1) {
        request.status = 'approved';
      }
    } else if (request.autonomyTier === 2) {
      // Auto-approve if within bounds (stub for Phase 1)
      request.status = 'approved';
    } else if (request.autonomyTier === 3) {
      // Auto-approve if simulation passes (stub; Phase 3 implements)
      if (request.biasCheckPassed) {
        request.status = 'approved';
      }
    }

    return true;
  }

  /**
   * Reject a request
   */
  reject(requestId: string, rejectedBy: string, reason: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'pending') return false;

    request.rejections.push({
      rejectedBy,
      rejectedAt: new Date().toISOString(),
      reason,
    });

    request.status = 'rejected';
    return true;
  }

  /**
   * Promote an approved request to active
   */
  activate(requestId: string): boolean {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'approved') return false;

    request.status = 'active';
    return true;
  }

  /**
   * Get a request
   */
  getRequest(requestId: string): ChangeRequest | undefined {
    return this.requests.get(requestId);
  }

  /**
   * List pending requests
   */
  listPending(): ChangeRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.status === 'pending');
  }

  /**
   * Get SLA metrics
   */
  getApprovalSLA(requestId: string): { waitTimeMs: number; escalated: boolean } | null {
    const request = this.requests.get(requestId);
    if (!request) return null;

    const createdTime = new Date(request.createdAt).getTime();
    const now = new Date().getTime();
    const waitTimeMs = now - createdTime;

    // Escalate if pending > 24 hours
    const escalated = request.status === 'pending' && waitTimeMs > 86400000;

    return { waitTimeMs, escalated };
  }
}

export const approvalWorkflow = new ApprovalWorkflow();
