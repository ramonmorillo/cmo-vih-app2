import {
  APP_VERSION,
  FIELD_DEFINITIONS,
  PRIORITY_CONFIG,
  SECTION_LABEL_KEYS
} from './config.js';
import { t } from './i18n.js';
import { renderFoundationSection } from './foundation-section.js';
import { computeCompletion } from './data-layer.js';

const STEP_SECTIONS = {
  1: ['demographic', 'clinical'],
  2: ['pharmacotherapy', 'healthCare', 'healthResults'],
  3: ['psychosocial', 'neurocognitive', 'frailty', 'socioeconomic']
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stateBadge(status, translate) {
  const map = {
    confirmed: translate('statuses.confirmed'),
    extracted: translate('statuses.extracted'),
    inferred: translate('statuses.inferred'),
    missing: translate('statuses.missing')
  };
  return map[status] || translate('statuses.missing');
}

function optionHtml(field, selectedValue) {
  return [`<option value="">${t('common.selectPlaceholder')}</option>`]
    .concat(field.optionKeys.map((key) => `<option value="${key}" ${selectedValue === key ? 'selected' : ''}>${t(field.optionLabelKeys[key])}</option>`))
    .join('');
}

function renderFieldCard(field, fieldState) {
  return `
    <label class="field-card">
      <span class="field-card__header">
        <span class="field-card__label">${t(field.labelKey)}</span>
        <span class="badge badge--${fieldState.status}">${stateBadge(fieldState.status, t)}</span>
      </span>
      <select data-field-id="${field.id}" class="manual-select">
        ${optionHtml(field, fieldState.value)}
      </select>
      <span class="field-card__meta">${t('traceability.source')}: ${fieldState.source || t('common.none')} · ${t('traceability.evidence')}: ${fieldState.evidence || t('common.none')}</span>
    </label>
  `;
}

function renderSection(sectionId, state) {
  const sectionFields = FIELD_DEFINITIONS.filter((field) => field.section === sectionId);
  return `
    <section class="step-section">
      <div class="step-section__header">
        <h3>${t(SECTION_LABEL_KEYS[sectionId])}</h3>
      </div>
      <div class="section-grid">
        ${sectionFields.map((field) => renderFieldCard(field, state.patientCase.fields[field.id])).join('')}
      </div>
    </section>
  `;
}

function renderDashboard(analysis) {
  if (!analysis) {
    return `<div class="empty-panel">${t('dashboard.empty')}</div>`;
  }

  return `
    <div class="dashboard-grid">
      <article class="metric-card metric-card--accent">
        <span class="metric-card__label">${t('dashboard.cmoLevel')}</span>
        <strong>${analysis.priorityLabel}</strong>
        <small>${t('dashboard.followUpIntensity')}: ${analysis.followUp}</small>
      </article>
      <article class="metric-card">
        <span class="metric-card__label">${t('dashboard.totalScore')}</span>
        <strong>${analysis.total}</strong>
        <small>${t('dashboard.autoClass')}: ${analysis.automaticPriorityLabel}</small>
      </article>
      <article class="metric-card">
        <span class="metric-card__label">${t('dashboard.keyDrivers')}</span>
        <strong>${analysis.explainability.keyDrivers.length}</strong>
        <small>${analysis.explainability.keyDrivers.map((item) => item.label).join(', ') || t('common.none')}</small>
      </article>
      <article class="metric-card">
        <span class="metric-card__label">${t('dashboard.riskFlags')}</span>
        <strong>${analysis.riskFlags.length}</strong>
        <small>${analysis.riskFlags.join(', ') || t('common.none')}</small>
      </article>
    </div>
  `;
}

function getDecisionConfidence(analysis, level) {
  if (!analysis) return 'low';
  if (analysis.finalLevel !== analysis.automaticLevel) return 'low';

  if (level === 1) return analysis.total >= 20 ? 'high' : 'medium';
  if (level === 2) return analysis.total >= 9 && analysis.total <= 13 ? 'high' : 'medium';
  return analysis.total <= 4 ? 'high' : 'medium';
}

function renderClinicalDecision(analysis) {
  if (!analysis) return '';

  const level = Number(analysis.finalLevel) || 3;
  const confidence = getDecisionConfidence(analysis, level);
  const interventionRequired = level === 1 || level === 2;
  const interventionKey = interventionRequired ? 'decision.intervention.required' : 'decision.intervention.notRequired';

  return `
    <section class="clinical-decision clinical-decision--level-${level}" aria-label="${t('decision.title')}">
      <p class="clinical-decision__eyebrow">${t('decision.title')}</p>
      <p class="clinical-decision__summary">${t(`decision.summary.level${level}`, {
        priority: analysis.priorityLabel,
        followUp: analysis.followUp,
        intervention: t(interventionKey),
        confidence: t(`decision.confidence.${confidence}`)
      })}</p>
      <div class="clinical-decision__meta">
        <article>
          <span>${t('decision.priority')}</span>
          <strong>${analysis.priorityLabel}</strong>
        </article>
        <article>
          <span>${t('decision.followUp')}</span>
          <strong>${analysis.followUp}</strong>
        </article>
        <article>
          <span>${t('decision.intervention.label')}</span>
          <strong>${t(interventionKey)}</strong>
        </article>
        <article>
          <span>${t('decision.confidence.label')}</span>
          <strong>${t(`decision.confidence.${confidence}`)}</strong>
        </article>
      </div>
    </section>
  `;
}

function renderTraceability(state, analysis) {
  const traceability = analysis?.traceability || {
    timestamp: state.patientCase.traceability.updatedAt,
    version: APP_VERSION,
    inputSource: state.patientCase.source,
    clinicianModifications: 0
  };

  return `
    <ul class="trace-list">
      <li><strong>${t('traceability.caseId')}:</strong> ${state.patientCase.caseId || t('common.none')}</li>
      <li><strong>${t('savedCases.patientLabel')}:</strong> ${escapeHtml(state.patientCase.pseudonymizedPatientLabel || t('common.none'))}</li>
      <li><strong>${t('traceability.timestamp')}:</strong> ${traceability.timestamp || t('common.none')}</li>
      <li><strong>${t('traceability.version')}:</strong> ${APP_VERSION}</li>
      <li><strong>${t('traceability.inputSource')}:</strong> ${traceability.inputSource}</li>
      <li><strong>${t('savedCases.storageLocation')}:</strong> ${t(`savedCases.storageMode.${state.savedCases.storageMode}`)}</li>
      <li><strong>${t('traceability.modifications')}:</strong> ${traceability.clinicianModifications}</li>
      <li><strong>${t('traceability.autosave')}:</strong> ${state.autosave.lastSavedAt || t('common.none')}</li>
    </ul>
  `;
}

function renderInterventions(analysis) {
  if (!analysis) return `<div class="empty-panel">${t('dashboard.empty')}</div>`;
  return `<ul class="bullet-list">${analysis.interventions.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function renderSavedCasesList(state) {
  const items = state.savedCases.filteredItems || [];
  if (!items.length) return `<div class="empty-panel">${t('savedCases.empty')}</div>`;

  return `<div class="saved-cases-list">${items.map((item) => `
    <article class="saved-case-card ${item.caseId === state.patientCase.caseId ? 'saved-case-card--active' : ''}">
      <div class="saved-case-card__header">
        <div>
          <strong>${escapeHtml(item.pseudonymizedPatientLabel || t('savedCases.noLabel'))}</strong>
          <p>${t('traceability.caseId')}: ${escapeHtml(item.caseId)}</p>
        </div>
        <span class="badge badge--confirmed">${escapeHtml(item.cmoLevel || t('common.none'))}</span>
      </div>
      <div class="saved-case-card__meta">
        <span>${t('savedCases.score')}: ${item.calculatedScore ?? t('common.none')}</span>
        <span>${t('savedCases.inputSource')}: ${escapeHtml(item.inputSource || t('common.none'))}</span>
      </div>
      <div class="saved-case-card__actions">
        <button type="button" class="button-ghost" data-saved-case-action="open" data-case-id="${escapeHtml(item.caseId)}">${t('savedCases.open')}</button>
        <button type="button" class="button-ghost" data-saved-case-action="duplicate" data-case-id="${escapeHtml(item.caseId)}">${t('savedCases.duplicate')}</button>
        <button type="button" class="button-ghost" data-saved-case-action="export" data-case-id="${escapeHtml(item.caseId)}">${t('savedCases.exportJson')}</button>
        <button type="button" class="button-ghost button-danger" data-saved-case-action="delete" data-case-id="${escapeHtml(item.caseId)}">${t('savedCases.delete')}</button>
      </div>
    </article>
  `).join('')}</div>`;
}

function renderSavedCasesSection(state) {
  const storageMessage = t('savedCases.helperStorage', { storage: t(`savedCases.storageMode.${state.savedCases.storageMode}`) });
  return `
    <section class="panel-card">
      <h3>${t('savedCases.title')}</h3>
      <div class="saved-cases-toolbar">
        <button id="saveCurrentCaseBtn">${t('savedCases.save')}</button>
        <button id="saveAsNewCaseBtn" class="button-secondary">${t('savedCases.saveAsNew')}</button>
        <button id="updateExistingCaseBtn" class="button-secondary">${t('savedCases.updateExisting')}</button>
      </div>
      <p class="supporting-text">${storageMessage}</p>
      <p class="supporting-text">${t('savedCases.helperPrivacy')}</p>
      ${state.savedCases.error ? `<div class="inline-alert">${escapeHtml(state.savedCases.error)}</div>` : ''}
      <div class="saved-cases-filters">
        <label>${t('savedCases.searchCaseId')}<input id="savedCaseIdSearch" value="${escapeHtml(state.savedCases.filters.caseId)}"></label>
        <label>${t('savedCases.searchPatientLabel')}<input id="savedPatientSearch" value="${escapeHtml(state.savedCases.filters.patientLabel)}"></label>
      </div>
      ${renderSavedCasesList(state)}
    </section>
  `;
}

function getStepProgress(state, step) {
  const sections = STEP_SECTIONS[step] || [];
  const relevantFields = FIELD_DEFINITIONS.filter((field) => sections.includes(field.section));
  if (!relevantFields.length) return 0;
  const completed = relevantFields.filter((field) => state.patientCase.fields[field.id]?.value).length;
  return Math.round((completed / relevantFields.length) * 100);
}

function renderStepContent(state, step) {
  if (step === 1) {
    return `
      <section class="section-card section-card--padded">
        <div class="section-body">
          <label>${t('settings.patientLabel')}
            <input id="patientLabel" value="${escapeHtml(state.patientCase.pseudonymizedPatientLabel || '')}" placeholder="${t('settings.patientLabelPlaceholder')}">
          </label>
          <details class="optional-details">
            <summary>${t('flow.optionalDetails')}</summary>
            <div class="optional-details__body">
              <p class="supporting-text">${t('settings.patientLabelHelp')}</p>
              <label>${t('settings.clinicianName')}<input id="clinicianName" value="${escapeHtml(state.patientCase.clinician.name || '')}" placeholder="${t('settings.clinicianNamePlaceholder')}"></label>
              <label>${t('settings.centerName')}<input id="centerName" value="${escapeHtml(state.patientCase.clinician.center || '')}" placeholder="${t('settings.centerNamePlaceholder')}"></label>
            </div>
          </details>
        </div>
      </section>
      ${STEP_SECTIONS[1].map((sectionId) => renderSection(sectionId, state)).join('')}
    `;
  }

  if (step === 2) {
    return STEP_SECTIONS[2].map((sectionId) => renderSection(sectionId, state)).join('');
  }

  return `
    ${STEP_SECTIONS[3].map((sectionId) => renderSection(sectionId, state)).join('')}
    <section class="section-card section-card--padded">
      <div class="section-body">
        <label>${t('override.useOverride')}
          <input type="checkbox" id="overrideEnabled" ${state.patientCase.override.enabled ? 'checked' : ''}>
        </label>
        <label>${t('override.selectLevel')}
          <select id="overrideLevel">
            <option value="auto" ${state.patientCase.override.level === 'auto' ? 'selected' : ''}>${t('override.auto')}</option>
            <option value="1" ${String(state.patientCase.override.level) === '1' ? 'selected' : ''}>${t(PRIORITY_CONFIG[1].labelKey)}</option>
            <option value="2" ${String(state.patientCase.override.level) === '2' ? 'selected' : ''}>${t(PRIORITY_CONFIG[2].labelKey)}</option>
            <option value="3" ${String(state.patientCase.override.level) === '3' ? 'selected' : ''}>${t(PRIORITY_CONFIG[3].labelKey)}</option>
          </select>
        </label>
        <label>${t('override.reason')}
          <textarea id="overrideReason" placeholder="${t('override.reasonPlaceholder')}">${escapeHtml(state.patientCase.override.reason || '')}</textarea>
        </label>
        <button id="recalculateBtn">${t('buttons.recalculate')}</button>
      </div>
    </section>
  `;
}

function renderWelcomeScreen(state) {
  return `
    <section class="welcome-card">
      <p class="eyebrow">${t('flow.welcomeEyebrow')}</p>
      <h1>${t('flow.appTitle')}</h1>
      <p class="hero__subtitle">${t('flow.welcomeSubtitle')}</p>
      <div class="welcome-card__meta">
        <span class="case-pill">${t('traceability.caseId')}: ${state.patientCase.caseId}</span>
        <span class="autosave-pill">${APP_VERSION}</span>
      </div>
      <button id="startFlowBtn" class="button-primary button-large">${t('flow.start')}</button>
    </section>
  `;
}

function renderProcessing() {
  return `
    <section class="processing-card">
      <div class="processing-spinner" aria-hidden="true"></div>
      <h2>${t('flow.processingTitle')}</h2>
      <p>${t('flow.processingSubtitle')}</p>
    </section>
  `;
}

function renderResult(state) {
  const analysis = state.analysis;
  return `
    ${renderClinicalDecision(analysis)}
    <section class="result-hero">
      <p class="eyebrow">${t('flow.resultEyebrow')}</p>
      <h2>${t('flow.resultTitle')}</h2>
      ${renderDashboard(analysis)}
    </section>
    <section class="panel-grid panel-grid--two">
      <article class="panel-card">
        <h3>${t('flow.interpretation')}</h3>
        <p>${analysis?.explainability?.why?.[0] || t('dashboard.empty')}</p>
        <p class="supporting-text">${t('dashboard.followUpIntensity')}: <strong>${analysis?.followUp || t('common.none')}</strong></p>
      </article>
      <article class="panel-card">
        <h3>${t('dashboard.riskFlags')}</h3>
        <ul>${analysis?.riskFlags?.map((item) => `<li>${item}</li>`).join('') || `<li>${t('common.none')}</li>`}</ul>
      </article>
      <article class="panel-card">
        <h3>${t('dashboard.suggestedInterventions')}</h3>
        ${renderInterventions(analysis)}
      </article>
      <article class="panel-card">
        <h3>${t('traceability.title')}</h3>
        ${renderTraceability(state, analysis)}
      </article>
    </section>
    <div class="button-row button-row--wrap">
      <button id="startNewEvalBtn">${t('flow.startNew')}</button>
      <button id="summaryExportBtn" class="button-secondary">${t('buttons.exportSummary')}</button>
      <button id="jsonExportBtn" class="button-secondary">${t('buttons.exportJson')}</button>
      <button id="csvExportBtn" class="button-secondary">${t('buttons.exportCsv')}</button>
      <button id="printBtn" class="button-secondary">${t('buttons.print')}</button>
    </div>
  `;
}

function renderNewCaseModal(state) {
  if (!state.ui?.modals?.newCase?.open) return '';
  return `
    <div class="modal-backdrop" id="newCaseModalBackdrop">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="newCaseModalTitle">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow eyebrow--modal">${t('newCase.eyebrow')}</p>
            <h2 id="newCaseModalTitle">${t('newCase.title')}</h2>
          </div>
          <button type="button" class="icon-button" id="cancelNewCaseBtn" aria-label="${t('newCase.cancel')}">×</button>
        </div>
        <p class="modal-card__body">${t('newCase.prompt')}</p>
        <div class="modal-card__actions">
          <button id="saveAndCreateCaseBtn">${t('newCase.saveAndCreate')}</button>
          <button id="createWithoutSavingBtn" class="button-secondary">${t('newCase.createWithoutSaving')}</button>
          <button id="cancelNewCaseBtnSecondary" class="button-ghost">${t('newCase.cancel')}</button>
        </div>
      </div>
    </div>
  `;
}

function renderWizard(state, uiHints = {}) {
  const currentStep = state.ui?.flow?.step || 1;
  const stepCompletion = getStepProgress(state, currentStep);
  const stepCounter = t('flow.stepCounter', { current: currentStep, total: 4 });
  const guidanceText = t(`flow.stepGuidance${currentStep}`);
  const showStepFeedback = currentStep < 4 && uiHints?.stepFeedback?.title;

  return `
    <header class="hero hero--compact">
      <div>
        <p class="eyebrow">${t('header.eyebrow')}</p>
        <h2>${t('flow.wizardTitle')}</h2>
        <p class="hero__subtitle">${guidanceText || t('flow.wizardSubtitle')}</p>
      </div>
      <div class="hero__actions">
        <label class="locale-switcher">
          <span>${t('header.language')}</span>
          <select id="localeSelect">
            <option value="es" ${state.locale === 'es' ? 'selected' : ''}>Español</option>
            <option value="en" ${state.locale === 'en' ? 'selected' : ''}>English</option>
            <option value="pt" ${state.locale === 'pt' ? 'selected' : ''}>Português</option>
          </select>
        </label>
      </div>
    </header>

    <section class="progress-card progress-card--stack">
      <div class="flow-stepper">
        ${[1, 2, 3, 4].map((step) => `<button id="goToStep${step}" class="step-chip ${step === currentStep ? 'step-chip--active' : ''}">${t(`flow.step${step}`)}</button>`).join('')}
      </div>
      <div class="progress-right">
        <strong class="step-counter">${stepCounter}</strong>
        <div class="progress-bar"><span style="width:${currentStep === 4 ? 100 : stepCompletion}%"></span></div>
        <span class="supporting-text progress-subtle">${t('flow.stepCompletion', { percent: currentStep === 4 ? 100 : stepCompletion })}</span>
      </div>
    </section>

    ${showStepFeedback ? `
      <section class="step-feedback" role="status" aria-live="polite">
        <strong>${uiHints.stepFeedback.title}</strong>
        ${uiHints.stepFeedback.subtitle ? `<span>${uiHints.stepFeedback.subtitle}</span>` : ''}
      </section>
    ` : ''}

    ${currentStep < 4 ? `<main class="step-layout">${renderStepContent(state, currentStep)}</main>` : renderResult(state)}

    ${currentStep < 4 ? `
      <nav class="sticky-nav">
        <button id="newCaseBtn" class="button-ghost">${t('buttons.newCase')}</button>
        <button id="stepBackBtn" class="button-secondary" ${currentStep === 1 ? 'disabled' : ''}>${t('flow.back')}</button>
        <button id="stepNextBtn" class="button-primary sticky-nav__primary">${currentStep === 3 ? t('flow.compute') : t('flow.next')}</button>
      </nav>
    ` : ''}

    <details class="section-card">
      <summary>${t('flow.advanced')}</summary>
      <div class="panel-grid panel-grid--two advanced-grid">
        <section class="panel-card">
          <h3>${t('inputs.textSection')}</h3>
          <textarea id="narrativeInput" placeholder="${t('inputs.textPlaceholder')}">${escapeHtml(state.patientCase.narrative || '')}</textarea>
          <div class="button-row">
            <button id="analyzeTextBtn">${t('buttons.analyzeText')}</button>
            <button id="loadExampleBtn" class="button-secondary">${t('buttons.loadExample')}</button>
          </div>
        </section>
        <section class="panel-card">
          <h3>${t('inputs.importSection')}</h3>
          <select id="importType">
            <option value="json" ${state.ui.importType === 'json' ? 'selected' : ''}>JSON</option>
            <option value="csv" ${state.ui.importType === 'csv' ? 'selected' : ''}>CSV</option>
          </select>
          <textarea id="importInput" placeholder="${t('inputs.importPlaceholder')}">${escapeHtml(state.patientCase.importRaw || '')}</textarea>
          <button id="importBtn" class="button-secondary">${t('buttons.import')}</button>
        </section>
        ${renderSavedCasesSection(state)}
      </div>
    </details>
  `;
}

export function renderApp(state, uiHints = {}) {
  document.title = APP_VERSION;
  const screen = state.ui?.flow?.screen || 'welcome';
  document.getElementById('app').innerHTML = `
    <div class="app-shell app-shell--flow">
      ${screen === 'welcome' ? renderWelcomeScreen(state) : ''}
      ${screen === 'processing' ? renderProcessing() : ''}
      ${screen === 'wizard' || screen === 'result' ? renderWizard(state, uiHints) : ''}
      ${renderFoundationSection()}
      ${renderNewCaseModal(state)}
    </div>
  `;
}
