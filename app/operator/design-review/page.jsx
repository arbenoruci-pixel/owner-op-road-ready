import {notFound} from 'next/navigation';
import DriverLayoutReview from './DriverLayoutReview.jsx';
import PodInvoiceExercise from './PodInvoiceExercise.jsx';
import {testLoad} from './podInvoiceSamples.js';

export const metadata = {title:'RoadReady driver layout preview', robots:{index:false,follow:false}};

export default async function DesignReview({searchParams}) {
  if (process.env.VERCEL_ENV !== 'preview') notFound();
  const query = await searchParams;
  if (query?.podInvoice && query.podInvoice !== testLoad.load_id) notFound();
  if (query?.test === 'pod-invoice' || query?.podInvoice === testLoad.load_id) {
    return <PodInvoiceExercise initialOffice={query.podInvoice === testLoad.load_id}/>;
  }
  return <DriverLayoutReview/>;
}
