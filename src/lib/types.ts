export type TabDefinition = {
  id: string;
  key: string;
  name: string;
  label: string;
  icon: string;
  route: string | null;
  permissions: string[];
  displayName: string;
  displayOrder: number;
  visible: boolean;
};

export type AppTabContent = {
  title: string;
  body: string;
};

export type ClientRecord = {
  id: string;
  crm_user_id: string;
};