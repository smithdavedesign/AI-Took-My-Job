export interface StoredCustomerPortalGrant {
  id: string;
  projectId: string;
  customerEmail: string;
  customerName?: string;
  status: 'active' | 'revoked';
  metadata: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  revokedAt?: string;
  expiresAt?: string;
}