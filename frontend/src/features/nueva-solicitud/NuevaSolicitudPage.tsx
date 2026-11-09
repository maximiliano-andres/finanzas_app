/** Sección "Registro de Nueva Solicitud" (#sectionNuevaSolicitud, forms.js + folio.js + validation.js). */
import { useRef, type FormEvent } from 'react';
import { MESES } from '@/types/domain';
import { CatalogSelect, FormBlock, LabeledField, TechBadge, fieldClass } from './FormParts';
import { FolioRowsEditor } from './FolioRowsEditor';
import { PreviewModal } from './PreviewModal';
import { useNuevaSolicitud } from './useNuevaSolicitud';

export default function NuevaSolicitudPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const f = useNuevaSolicitud(formRef);
  const { values: v, errors, serverErrorFields: se } = f;
  const fe = errors.fieldErrors;
  const onSubmit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); f.validateAndPreview(); };

  return (
    <section id="sectionNuevaSolicitud" className="content-section max-w-6xl mx-auto">
      <header className="page-header">
        <div>
          <h2 className="page-title"><i className="fas fa-plus-circle" aria-hidden="true" />Registro de Nueva Solicitud</h2>
          <p className="page-subtitle">Complete los campos requeridos para formalizar el requerimiento de pago.</p>
        </div>
      </header>

      <form id="formSolicitud" ref={formRef} className="space-y-5" noValidate onSubmit={onSubmit}>
        <FormBlock icon="fa-calendar-alt" title="Identificación del Período" helpId="periodo"
          bodyClass="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mobile-p-4">
          <LabeledField id="mesProceso" label="Mes de Proceso" error={fe.mesProceso}>
            <select id="mesProceso" required value={v.mesProceso} onChange={(e) => f.set('mesProceso', e.target.value)}
              className={fieldClass('form-select', !!fe.mesProceso, se.includes('mesProceso'))}>
              <option value="">Seleccione mes...</option>
              {MESES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </LabeledField>
          <LabeledField id="fechaProceso" label="Fecha Emisión" error={fe.fechaProceso}>
            <input type="date" id="fechaProceso" required value={v.fechaProceso} onChange={(e) => f.set('fechaProceso', e.target.value)}
              className={fieldClass('form-input', !!fe.fechaProceso)} />
          </LabeledField>
          <LabeledField id="fechaPago" label="Fecha Estimada Pago" error={fe.fechaPago}>
            <input type="date" id="fechaPago" required value={v.fechaPago} onChange={(e) => f.set('fechaPago', e.target.value)}
              className={fieldClass('form-input', !!fe.fechaPago)} />
          </LabeledField>
        </FormBlock>

        <FormBlock icon="fa-building" title="Entidad y Clasificación" helpId="entidad" bodyClass="p-4 sm:p-6 space-y-5 mobile-p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            <LabeledField id="empresa" label="Empresa Mandante" error={fe.empresa}>
              <CatalogSelect id="empresa" value={v.empresaId} onChange={(x) => f.set('empresaId', x)} query={f.catalogs.empresas}
                loadingText="Cargando empresas..." errorText="Error al cargar empresas" optionLabel={(x) => x.empresa}
                className={fieldClass('form-select', !!fe.empresa, se.includes('empresa'))} />
            </LabeledField>
            <LabeledField id="obra" label="Unidad de Negocio / Obra" error={fe.obra}>
              {/* Igual que el original: el backend ya devuelve solo las obras asignadas al usuario; no se filtra por estado. */}
              <CatalogSelect id="obra" value={v.obraId} onChange={(x) => f.set('obraId', x)} query={f.catalogs.obras}
                loadingText="Cargando..." errorText="Error al cargar" optionLabel={(x) => x.detalle}
                className={fieldClass('form-select', !!fe.obra, se.includes('obra'))} />
            </LabeledField>
            <LabeledField id="proceso" label="Proceso Operativo" error={fe.proceso}>
              <CatalogSelect id="proceso" value={v.procesoId} onChange={(x) => f.set('procesoId', x)} query={f.catalogs.procesos}
                loadingText="Cargando..." errorText="Error al cargar" optionLabel={(x) => x.nombre}
                className={fieldClass('form-select', !!fe.proceso, se.includes('proceso'))} />
            </LabeledField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 sm:p-4 bg-slate-50 rounded-xl border border-slate-200 mobile-p-2">
            <TechBadge id="une" label="Código UNE" value={f.derived.une} />
            <TechBadge id="cuentaObjeto" label="Cuenta Objeto" value={f.derived.cuentaObjeto} />
            <TechBadge id="cuentaAuxiliar" label="Cuenta Auxiliar" value={f.derived.cuentaAuxiliar} />
          </div>
        </FormBlock>

        <FormBlock icon="fa-money-check-alt" title=" Detalle Financiero" helpId="financiero" bodyClass="p-4 sm:p-6 space-y-5">
          <FolioRowsEditor rows={v.folios} errors={errors.folioErrors} onChange={f.setFolios} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <LabeledField id="monto" label="Monto Total" error={fe.monto}>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-semibold">$</div>
                <input type="text" id="monto" required readOnly value={f.montoTotal} placeholder="0"
                  className={`${fieldClass('form-input', !!fe.monto, se.includes('monto'))} !pl-7 text-lg font-semibold tabular-nums !text-slate-900 cursor-not-allowed`} />
              </div>
            </LabeledField>
          </div>
          <div className="p-3 sm:p-4 bg-slate-50 rounded-xl border border-slate-200">
            <TechBadge id="glosa" label="Glosa Técnica (Automática)" value={f.derived.glosa} wide />
          </div>
        </FormBlock>

        <FormBlock icon="fa-comment-dots" title="Agregar Observaciones (Opcional)" helpId="observaciones" bodyClass="p-4 sm:p-6 flex-1">
          <label htmlFor="observaciones" className="sr-only">Agregar Observaciones (Opcional)</label>
          <textarea id="observaciones" rows={5} value={v.observaciones} onChange={(e) => f.set('observaciones', e.target.value)}
            className="form-input ui-input resize-none"
            placeholder="Añada notas adicionales para el aprobador..." />
        </FormBlock>

        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 sm:gap-3 pt-2 pb-6">
          <button type="button" onClick={f.reset} data-testid="limpiar-formulario"
            className="ui-btn ui-btn-secondary ui-btn-lg order-2 sm:order-1">
            <i className="fas fa-eraser" aria-hidden="true" />Limpiar Formulario
          </button>
          <button type="submit" data-testid="validar-previsualizar"
            className="ui-btn ui-btn-primary ui-btn-lg order-1 sm:order-2">
            <i className="fas fa-check-double" aria-hidden="true" />Validar y Previsualizar
          </button>
        </div>
      </form>

      {f.previewOpen && (
        <PreviewModal submitting={f.submitting} onBack={f.closePreview} onConfirm={f.confirm} data={{
          values: v, empresaNombre: f.selected.empresa?.empresa ?? '', obraNombre: f.selected.obra?.detalle ?? '',
          procesoNombre: f.selected.proceso?.nombre ?? '', ...f.derived, montoTotal: f.montoTotal,
        }} />
      )}
    </section>
  );
}
