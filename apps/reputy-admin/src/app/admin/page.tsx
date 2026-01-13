'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Users, 
  CreditCard, 
  MessageSquare, 
  Mail, 
  AlertTriangle,
  TrendingUp,
  Activity,
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronRight,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  Eye
} from 'lucide-react';

interface AdminClient {
  id: string;
  name: string;
  email: string;
  plan: 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled' | 'trial';
  createdAt: Date;
  lastActivity: Date;
  mrr: number;
  smsUsed: number;
  emailsUsed: number;
  aiUsed: number;
}

interface AdminAlert {
  id: string;
  type: 'payment_failed' | 'sms_error' | 'email_bounce' | 'quota_exceeded' | 'security';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  clientId?: string;
  clientName?: string;
  timestamp: Date;
  resolved: boolean;
}

interface AdminPayment {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  type: 'subscription' | 'pack_sms' | 'pack_email' | 'pack_ai';
  status: 'succeeded' | 'failed' | 'pending' | 'refunded';
  date: Date;
  method: 'sepa' | 'card';
}

const MOCK_CLIENTS: AdminClient[] = [
  {
    id: '1',
    name: 'Cabinet Dr. Martin',
    email: 'contact@dr-martin.fr',
    plan: 'pro',
    status: 'active',
    createdAt: new Date(2025, 3, 15),
    lastActivity: new Date(2026, 0, 10),
    mrr: 49,
    smsUsed: 234,
    emailsUsed: 1456,
    aiUsed: 45,
  },
  {
    id: '2',
    name: 'Pharmacie Centrale',
    email: 'pharmacie.centrale@email.com',
    plan: 'starter',
    status: 'active',
    createdAt: new Date(2025, 5, 20),
    lastActivity: new Date(2026, 0, 9),
    mrr: 19,
    smsUsed: 89,
    emailsUsed: 567,
    aiUsed: 0,
  },
];

const MOCK_ALERTS: AdminAlert[] = [
  {
    id: 'a1',
    type: 'payment_failed',
    severity: 'high',
    message: 'Prélèvement SEPA rejeté - Provision insuffisante',
    clientId: '5',
    clientName: 'Dr. Sophie Leblanc',
    timestamp: new Date(2025, 11, 15),
    resolved: false,
  },
];

const MOCK_PAYMENTS: AdminPayment[] = [
  {
    id: 'p1',
    clientId: '1',
    clientName: 'Cabinet Dr. Martin',
    amount: 49,
    type: 'subscription',
    status: 'succeeded',
    date: new Date(2026, 0, 1),
    method: 'sepa',
  },
];

function AdminSidebar({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (tab: string) => void }) {
  const menuItems = [
    { id: 'dashboard', label: 'Vue d\'ensemble', icon: Activity },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'payments', label: 'Paiements', icon: CreditCard },
    { id: 'alerts', label: 'Alertes', icon: AlertTriangle },
  ];

  return (
    <div className="w-64 bg-gray-900 text-white min-h-screen p-4">
      <div className="flex items-center gap-2 mb-8">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold">
          R
        </div>
        <span className="font-semibold">Reputy Admin</span>
      </div>

      <nav className="space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              activeTab === item.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
            {item.id === 'alerts' && MOCK_ALERTS.filter(a => !a.resolved).length > 0 && (
              <Badge className="ml-auto bg-red-500 text-xs">
                {MOCK_ALERTS.filter(a => !a.resolved).length}
              </Badge>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

function KPICard({ title, value, subValue, icon: Icon, trend }: {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { value: number; positive: boolean };
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subValue && <p className="text-xs text-gray-500 mt-1">{subValue}</p>}
            {trend && (
              <div className={`flex items-center gap-1 text-xs mt-2 ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
                <TrendingUp className={`w-3 h-3 ${!trend.positive && 'rotate-180'}`} />
                {trend.positive ? '+' : ''}{trend.value}% vs mois dernier
              </div>
            )}
          </div>
          <div className="p-3 bg-gray-100 rounded-lg">
            <Icon className="w-5 h-5 text-gray-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardContent() {
  const totalMRR = MOCK_CLIENTS.reduce((sum, c) => sum + c.mrr, 0);
  const activeClients = MOCK_CLIENTS.filter(c => c.status === 'active').length;
  const totalSMS = MOCK_CLIENTS.reduce((sum, c) => sum + c.smsUsed, 0);
  const totalEmails = MOCK_CLIENTS.reduce((sum, c) => sum + c.emailsUsed, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vue d'ensemble</h1>
        <Button variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualiser
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KPICard
          title="MRR Total"
          value={`${totalMRR}€`}
          subValue="Revenus récurrents mensuels"
          icon={CreditCard}
          trend={{ value: 12, positive: true }}
        />
        <KPICard
          title="Clients actifs"
          value={activeClients}
          subValue={`sur ${MOCK_CLIENTS.length} total`}
          icon={Users}
          trend={{ value: 5, positive: true }}
        />
        <KPICard
          title="SMS ce mois"
          value={totalSMS.toLocaleString('fr-FR')}
          subValue="~62€ de coût"
          icon={MessageSquare}
        />
        <KPICard
          title="Emails ce mois"
          value={totalEmails.toLocaleString('fr-FR')}
          subValue="~8€ de coût"
          icon={Mail}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Alertes récentes</CardTitle>
          <Badge variant="outline" className="text-red-600 border-red-200">
            {MOCK_ALERTS.filter(a => !a.resolved).length} non résolues
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {MOCK_ALERTS.slice(0, 3).map((alert) => (
              <div 
                key={alert.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  alert.resolved ? 'bg-gray-50' : 'bg-red-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    alert.severity === 'critical' ? 'bg-red-600' :
                    alert.severity === 'high' ? 'bg-orange-500' :
                    alert.severity === 'medium' ? 'bg-yellow-500' : 'bg-gray-400'
                  }`} />
                  <div>
                    <p className="text-sm font-medium">{alert.message}</p>
                    <p className="text-xs text-gray-500">
                      {alert.clientName} • {alert.timestamp.toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
                {alert.resolved ? (
                  <Badge className="bg-green-100 text-green-700">Résolu</Badge>
                ) : (
                  <Button size="sm" variant="outline">Traiter</Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Derniers paiements</CardTitle>
          <Button variant="ghost" size="sm">
            Voir tout <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 font-medium">Client</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Montant</th>
                <th className="pb-2 font-medium">Méthode</th>
                <th className="pb-2 font-medium">Statut</th>
                <th className="pb-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_PAYMENTS.map((payment) => (
                <tr key={payment.id} className="border-b last:border-0">
                  <td className="py-3">{payment.clientName}</td>
                  <td className="py-3">
                    <Badge variant="outline">
                      {payment.type === 'subscription' ? 'Abo' : 
                       payment.type === 'pack_sms' ? 'SMS' :
                       payment.type === 'pack_email' ? 'Email' : 'IA'}
                    </Badge>
                  </td>
                  <td className="py-3 font-medium">{payment.amount}€</td>
                  <td className="py-3 uppercase text-xs">{payment.method}</td>
                  <td className="py-3">
                    {payment.status === 'succeeded' ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-4 h-4" /> Payé
                      </span>
                    ) : payment.status === 'failed' ? (
                      <span className="flex items-center gap-1 text-red-600">
                        <XCircle className="w-4 h-4" /> Échoué
                      </span>
                    ) : (
                      <span className="text-yellow-600">En attente</span>
                    )}
                  </td>
                  <td className="py-3 text-gray-500">
                    {payment.date.toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ClientsContent() {
  const [search, setSearch] = useState('');
  const filteredClients = MOCK_CLIENTS.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Exporter CSV
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Rechercher un client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline">
          <Filter className="w-4 h-4 mr-2" />
          Filtres
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="p-4 font-medium">Client</th>
                <th className="p-4 font-medium">Plan</th>
                <th className="p-4 font-medium">Statut</th>
                <th className="p-4 font-medium">MRR</th>
                <th className="p-4 font-medium">SMS</th>
                <th className="p-4 font-medium">Emails</th>
                <th className="p-4 font-medium">Dernière activité</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <tr key={client.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4">
                    <div>
                      <p className="font-medium">{client.name}</p>
                      <p className="text-xs text-gray-500">{client.email}</p>
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge className={client.plan === 'pro' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}>
                      {client.plan}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <Badge className={client.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                      {client.status}
                    </Badge>
                  </td>
                  <td className="p-4 font-medium">{client.mrr}€</td>
                  <td className="p-4">{client.smsUsed}</td>
                  <td className="p-4">{client.emailsUsed}</td>
                  <td className="p-4 text-gray-500">
                    {client.lastActivity.toLocaleDateString('fr-FR')}
                  </td>
                  <td className="p-4">
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentsContent() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Paiements</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="p-4 font-medium">ID</th>
                <th className="p-4 font-medium">Client</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Montant</th>
                <th className="p-4 font-medium">Méthode</th>
                <th className="p-4 font-medium">Statut</th>
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_PAYMENTS.map((payment) => (
                <tr key={payment.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4 font-mono text-xs">{payment.id}</td>
                  <td className="p-4">{payment.clientName}</td>
                  <td className="p-4">
                    {payment.type === 'subscription' ? 'Abonnement' :
                     payment.type === 'pack_sms' ? 'Pack SMS' :
                     payment.type === 'pack_email' ? 'Pack Email' : 'Pack IA'}
                  </td>
                  <td className="p-4 font-medium">{payment.amount}€</td>
                  <td className="p-4 uppercase">{payment.method}</td>
                  <td className="p-4">
                    {payment.status === 'succeeded' ? (
                      <Badge className="bg-green-100 text-green-700">Payé</Badge>
                    ) : payment.status === 'failed' ? (
                      <Badge className="bg-red-100 text-red-700">Échoué</Badge>
                    ) : (
                      <Badge className="bg-yellow-100 text-yellow-700">En attente</Badge>
                    )}
                  </td>
                  <td className="p-4">{payment.date.toLocaleDateString('fr-FR')}</td>
                  <td className="p-4">
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardContent />;
      case 'clients':
        return <ClientsContent />;
      case 'payments':
        return <PaymentsContent />;
      case 'alerts':
        return (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold">Alertes</h1>
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {MOCK_ALERTS.map((alert) => (
                    <div 
                      key={alert.id}
                      className={`flex items-center justify-between p-4 rounded-lg border ${
                        alert.resolved ? 'bg-gray-50 border-gray-200' : 
                        alert.severity === 'critical' ? 'bg-red-50 border-red-200' :
                        alert.severity === 'high' ? 'bg-orange-50 border-orange-200' :
                        'bg-yellow-50 border-yellow-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <AlertTriangle className={`w-5 h-5 mt-0.5 ${
                          alert.severity === 'critical' ? 'text-red-600' :
                          alert.severity === 'high' ? 'text-orange-500' : 'text-yellow-500'
                        }`} />
                        <div>
                          <p className="font-medium">{alert.message}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            {alert.clientName && `Client: ${alert.clientName} • `}
                            {alert.timestamp.toLocaleString('fr-FR')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {alert.resolved ? (
                          <Badge className="bg-green-100 text-green-700">Résolu</Badge>
                        ) : (
                          <>
                            <Button size="sm" variant="outline">Ignorer</Button>
                            <Button size="sm">Traiter</Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Section en cours de développement</p>
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="flex-1 p-8">
        {renderContent()}
      </div>
    </div>
  );
}
