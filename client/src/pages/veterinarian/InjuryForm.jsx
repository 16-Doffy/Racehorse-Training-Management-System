import { Navigate, useParams, useSearchParams } from 'react-router-dom';

/** Links from before the redesign: the injury form is now a dialog on the injuries page. */
export default function InjuryForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const horseId = params.get('horseId');
  if (id) return <Navigate to={`/veterinarian/injuries?edit=${id}`} replace />;
  return <Navigate to={`/veterinarian/injuries?new=1${horseId ? `&horseId=${horseId}` : ''}`} replace />;
}
