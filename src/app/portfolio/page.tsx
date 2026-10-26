import { redirect } from 'next/navigation';

/**
 * Portfolio was superseded by the operator-facing Properties grid, which
 * shows the same buildings with a live pulse. Kept as a redirect so old
 * links (and the AI assistant's "View in Portfolio" action) still land
 * somewhere real.
 */
export default function Portfolio() {
  redirect('/properties');
}
