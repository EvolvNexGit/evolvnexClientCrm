export type TabDefinition = {
  id: string;
  label: string;
  icon: string;
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