import { notFound } from 'next/navigation';
import Styleguide from './Styleguide';

// Dev-only reference page for the visual foundation.
export default function StyleguidePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Styleguide />;
}
