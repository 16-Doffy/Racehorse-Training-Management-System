import { useParams } from 'react-router-dom';
import ExamRecordView from '../../components/veterinarian/ExamRecordView';

/** One filed exam on its own page (/veterinarian/examinations/:id); lists open it in a drawer instead. */
export default function ExamRecordPage() {
  const { id } = useParams();
  return (
    <div className="vet-ui">
      <ExamRecordView id={id} />
    </div>
  );
}
