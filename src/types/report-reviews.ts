export interface StoredReportReview {
  id: string;
  feedbackReportId: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewerId?: string;
  repository?: string;
  notes?: string;
  reviewedAt?: string;
}