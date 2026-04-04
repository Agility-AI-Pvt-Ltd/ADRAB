import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { submissionsApi } from '../api';
import type { Submission } from '../types';
import SubmissionDetail from '../components/SubmissionDetail';
import { Spinner, useToast } from '../components/shared';

export default function SubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    submissionsApi.get(id)
      .then(res => setSubmission(res.data))
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
