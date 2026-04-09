import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { submissionsApi } from '../api';
import type { Submission } from '../types';
import SubmissionDetail from '../components/SubmissionDetail';
import { Spinner, useToast } from '../components/shared';

import { cachedFetch, readCache } from '../utils/apiCache';

export default function SubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  // Try to instantly grab cached submission on mount
  const initialData = readCache<Submission>(`submission_${id}`)?.data ?? null;
  const [submission, setSubmission] = useState<Submission | null>(initialData);
  const [loading, setLoading] = useState(initialData === null);

  useEffect(() => {
    if (!id) return;
    
    cachedFetch(
      `submission_${id}`,
      () => submissionsApi.get(id).then(r => r.data),
      {
        ttl: 30_000,            // Fresh for 30 seconds
        staleTtl: 30 * 60_000,  // Stale for 30 minutes
        onRefresh: (fresh) => setSubmission(fresh)
      }
    )
      .then(data => setSubmission(data))
      .catch(() => {
        toast('error', 'Could not load submission');
        navigate(-1);
      })
      .finally(() => setLoading(false));
  }, [id, navigate, toast]);

  if (loading) {
    return (
      <div className="content" style={{ display: 'flex', justifyContent: 'center', paddingTop: '100px' }}>
        <Spinner dark />
      </div>
    );
  }

  if (!submission) return null;

  return (
    <SubmissionDetail 
      submission={submission} 
      onClose={() => navigate(-1)} 
      onUpdated={(s) => setSubmission(s)} 
    />
  );
}
