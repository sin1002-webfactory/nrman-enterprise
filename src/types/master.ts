export interface MasterCompanyRecord {
  id: string;
  clientCode: string;
  companyName: string;
  prefix: string;
  gstNumber: string;
  logoUrl?: string;
  googleEmail?: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  status: 'Active' | 'Pending' | 'Suspended';
  createdAt: string;
  lastUpdated: string;
}

export interface ClientRecord {
  id: string;
  clientCode: string;
  clientName: string;
  contactEmail: string;
  phone?: string;
  plan?: string;
  status: 'Active' | 'Inactive';
  companiesCount: number;
  companies?: MasterCompanyRecord[];
  createdAt: string;
  lastActive: string;
}

export interface MasterDatabaseStats {
  totalClients: number;
  totalCompanies: number;
  totalSheetsConnected: number;
  totalGstNumbers: number;
}
