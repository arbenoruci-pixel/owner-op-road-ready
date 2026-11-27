import {notFound} from 'next/navigation';
import DriverLayoutReview from './DriverLayoutReview.jsx';

export const metadata = {title:'RoadReady driver layout preview', robots:{index:false,follow:false}};

export default function DesignReview() {
  if (process.env.VERCEL_ENV !== 'preview') notFound();
  return <DriverLayoutReview/>;
}
