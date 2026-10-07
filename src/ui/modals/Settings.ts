import type { Settings } from '../../platform/settings.ts';
import { button, h } from '../dom.ts';
import { t } from '../../platform/i18n/i18n.ts';
import type { ModalStack } from './ModalStack.ts';

export interface SettingsDeps {
  settings: Settings;
  apply: (s: Settings, changed: keyof Settings) => void;
  privacyOptionsAvailable: boolean;
  showPrivacyOptions: () => void;
  privacyUrl: string;
  resetProgress: () => void;
  version: string;
}

function seg<T extends string | boolean>(options: [T, string][], value: T, onPick: (v: T) => void): HTMLElement {
  const wrap = h('div', { class: 'seg', 'data-ui': true });
  const btns = options.map(([v, label]) => {
    const b = button(value === v ? 'on' : '', () => {
      btns.forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onPick(v);
    }, label);
    b.className = value === v ? 'on' : '';
    return b;
  });
  wrap.append(...btns);
  return wrap;
}

export function openSettings(modals: ModalStack, d: SettingsDeps): void {
  modals.push('settings', (close) => {
    const s = d.settings;
    const onOff = (key: 'sound' | 'music' | 'haptics' | 'reduceMotion' | 'toggleHold') =>
      seg<boolean>([[true, t('settings.on')], [false, t('settings.off')]], s[key], (v) => {
        s[key] = v;
        d.apply(s, key);
      });
    const row = (label: string, ctl: HTMLElement) => h('div', { class: 'setting' }, h('span', {}, label), ctl);
    const list = h(
      'div',
      { class: 'settings-list' },
      row(t('settings.sound'), onOff('sound')),
      row(t('settings.music'), onOff('music')),
      row(t('settings.haptics'), onOff('haptics')),
      row(
        t('settings.language'),
        seg<Settings['lang']>([['auto', t('settings.language.auto')], ['en', 'EN'], ['de', 'DE']], s.lang, (v) => {
          s.lang = v;
          d.apply(s, 'lang');
          close();
          openSettings(modals, d);
        }),
      ),
      row(
        t('settings.graphics'),
        seg<Settings['quality']>(
          [['auto', t('settings.graphics.auto')], ['low', t('settings.graphics.low')], ['med', t('settings.graphics.med')], ['high', t('settings.graphics.high')]],
          s.quality,
          (v) => {
            s.quality = v;
            d.apply(s, 'quality');
          },
        ),
      ),
      row(t('settings.reduceMotion'), onOff('reduceMotion')),
      row(t('settings.toggleHold'), onOff('toggleHold')),
    );
    const extras = h('div', { class: 'btn-row' });
    if (d.privacyOptionsAvailable) extras.append(button('btn-big grey', () => d.showPrivacyOptions(), t('settings.privacy')));
    // Web portals forbid outbound links; their own pages cover privacy.
    const policy = d.privacyUrl ? h('a', { class: 'link', href: d.privacyUrl, target: '_blank', rel: 'noopener', 'data-ui': true }, t('settings.privacyPolicy')) : null;
    // In-game confirmation (window.confirm is blocked in portal iframes and looks off-brand on Android).
    const reset = button('link', () => {
      modals.push('confirm-reset', (closeConfirm) => [
        h('h2', {}, t('settings.reset')),
        h('p', {}, t('settings.resetConfirm')),
        h(
          'div',
          { class: 'btn-row' },
          button('btn-big grey', () => closeConfirm(), t('common.no')),
          button('btn-big danger', () => d.resetProgress(), t('common.yes')),
        ),
      ]);
    }, t('settings.reset'));
    return [h('h2', {}, t('settings.title')), list, extras, policy, reset, h('div', { class: 'version' }, `Crop Crawler v${d.version}`)];
  });
}
