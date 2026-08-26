/**
 * Draft legal notice (Impressum) — German is authoritative.
 * Replace ADDRESS_PLACEHOLDER with a serviceable postal address before going public.
 */
export const OPERATOR = {
  name: "Michael Schmidt",
  email: "m@michaelschmidt.berlin",
  phone: "+49 163 7951207",
  addressLines: [
    "Turiner Straße 21",
    "13347 Berlin",
    "Deutschland",
  ],
} as const;

/** Full HTML body for the Impressum overlay / static page (German). */
export function impressumHtml(): string {
  const addr = OPERATOR.addressLines.map((l) => escapeHtml(l)).join("<br />");
  return `
<section class="legal-section">
  <p class="legal-draft-note"><strong>Entwurf</strong> — vor dem öffentlichen Go-live rechtlich prüfen. Keine Rechtsberatung.</p>
</section>

<section class="legal-section">
  <h2>Angaben gemäß § 5 DDG</h2>
  <p>
    ${escapeHtml(OPERATOR.name)}<br />
    ${addr}
  </p>
</section>

<section class="legal-section">
  <h2>Kontakt</h2>
  <p>
    Telefon: <a href="tel:${escapeHtml(OPERATOR.phone.replace(/\s/g, ""))}">${escapeHtml(OPERATOR.phone)}</a><br />
    E-Mail: <a href="mailto:${escapeHtml(OPERATOR.email)}">${escapeHtml(OPERATOR.email)}</a>
  </p>
</section>

<section class="legal-section">
  <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
  <p>
    ${escapeHtml(OPERATOR.name)}<br />
    ${addr}
  </p>
</section>

<section class="legal-section">
  <h2>Art des Angebots</h2>
  <p>
    <em>steineroriginals</em> ist ein nicht-kommerzielles Informationsangebot: ein Katalog zu Vorträgen
    Rudolf Steiners mit Verweisen auf digitalisierte Originalmanuskripte (Scans). Es werden keine
    Waren verkauft und keine Nutzerkonten geführt.
  </p>
</section>

<section class="legal-section">
  <h2>Hinweis zu den Manuskript-PDFs</h2>
  <p>
    Die hier verlinkten Scan-PDFs sind nach Kenntnis des Anbieters seit vielen Jahren (mindestens
    etwa 15 Jahre) auch an anderen Stellen im Internet öffentlich auffindbar. Dieses Angebot
    macht sie in einem katalogbasierten Kontext zugänglich. Sollten Rechteinhaber eine
    Entfernung einzelner Dateien wünschen, genügt eine formlose Mitteilung an die oben genannte
    E-Mail-Adresse; berechtigte Hinweise werden zeitnah geprüft.
  </p>
</section>

<section class="legal-section">
  <h2>Haftung für Inhalte</h2>
  <p>
    Die Inhalte dieser Website wurden mit Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit
    und Aktualität der Katalogangaben (Metadaten) sowie der verlinkten Dokumente wird
    <strong>keine Gewähr</strong> übernommen. Insbesondere können falsche Zuordnungen von
    Vorträgen zu Orten, Daten, GA-Bänden oder Zyklen sowie irrtümlich verknüpfte Manuskript-PDFs
    vorkommen, die bei der Kuratierung übersehen wurden. Nutzerinnen und Nutzer prüfen kritische
    Angaben bitte selbst anhand der Quellen.
  </p>
  <p>
    Nach §§ 8 bis 10 DDG ist der Anbieter als Diensteanbieter nicht verpflichtet,
    übermittelte oder gespeicherte fremde Informationen zu überwachen.
  </p>
</section>

<section class="legal-section">
  <h2>Haftung für Links</h2>
  <p>
    Externe Links (einschließlich Objekt-Speicher / CDN) liegen außerhalb des unmittelbaren
    Einflussbereichs dieses Angebots. Für deren Inhalte sind ausschließlich die jeweiligen
    Betreiber verantwortlich. Bei Bekanntwerden von Rechtsverletzungen werden betroffene Links
    umgehend entfernt.
  </p>
</section>

<section class="legal-section">
  <h2>Urheberrecht</h2>
  <p>
    Soweit Inhalte auf dieser Website nicht gemeinfrei sind oder anderweitig genutzt werden dürfen,
    liegen die Rechte bei den jeweiligen Rechteinhabern. Vervielfältigung oder Verbreitung über den
    durch die öffentliche Zugänglichkeit ohnehin bestehenden Rahmen hinaus bedarf ggf. der
    Zustimmung der Rechteinhaber.
  </p>
</section>

<section class="legal-section">
  <h2>Datenschutz (Kurzhinweis)</h2>
  <p>
    Beim Aufruf der Website werden technisch notwendige Verbindungsdaten durch den Hosting- und
    Speicheranbieter <strong>Cloudflare, Inc.</strong> (Cloudflare Pages bzw. R2) verarbeitet
    (z.&nbsp;B. IP-Adresse, Zeitpunkt, angeforderte Ressource) — erforderlich zur Auslieferung der
    Seiten und PDF-Dateien (Art. 6 Abs. 1 lit. f DSGVO). Es werden keine Analyse-Cookies und keine
    Nutzerkonten eingesetzt.
  </p>
  <p>
    Zur Darstellung von Schriftarten kann ein Abruf bei <strong>Google Fonts</strong>
    (Google Ireland Limited) erfolgen; dabei kann die IP-Adresse an Google übermittelt werden.
    Alternativ können die Schriften später selbst gehostet werden, um diese Übermittlung zu vermeiden.
  </p>
  <p>
    Betroffenenrechte (Auskunft, Löschung usw.) können unter der oben genannten E-Mail geltend
    gemacht werden. Beschwerderecht besteht bei einer Datenschutz-Aufsichtsbehörde.
  </p>
</section>
`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
