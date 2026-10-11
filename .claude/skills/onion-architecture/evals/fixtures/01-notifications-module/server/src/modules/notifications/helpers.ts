import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { TEMPLATE_DIR, type NotifyChannel } from './constants.js';

export interface NotificationVars {
  title: string;
  number: number;
  author: string;
}

export function interpolate(template: string, vars: NotificationVars): string {
  return template
    .replaceAll('{{title}}', vars.title)
    .replaceAll('{{number}}', String(vars.number))
    .replaceAll('{{author}}', vars.author);
}

export async function renderNotification(
  channel: NotifyChannel,
  vars: NotificationVars,
): Promise<string> {
  const template = await readFile(join(TEMPLATE_DIR, `${channel}.md`), 'utf8');
  return interpolate(template, vars);
}
