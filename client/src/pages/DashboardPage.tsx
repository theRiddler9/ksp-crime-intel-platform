import { getCurrentUser } from '../services/auth';
import { ConstableView } from '../views-by-role/ConstableView';
import { SHOView } from '../views-by-role/SHOView';
import { SPView } from '../views-by-role/SPView';
import { AnalystView } from '../views-by-role/AnalystView';
import { DGPView } from '../views-by-role/DGPView';

export function DashboardPage() {
  const user = getCurrentUser();

  if (!user) return null; // Should be caught by route guard

  switch (user.role) {
    case 'constable': return <ConstableView />;
    case 'sho': return <SHOView />;
    case 'sp': return <SPView />;
    case 'analyst': return <AnalystView />;
    case 'dgp': return <DGPView />;
    default: return <ConstableView />;
  }
}
