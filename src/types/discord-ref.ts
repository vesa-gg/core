export interface DiscordUserRef {
  id: string;
  displayName: string;
}

export interface Actor extends DiscordUserRef {
  roleIds: string[];
}
