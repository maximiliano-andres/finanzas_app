/** Contenido del manual de ayuda — extraído automáticamente de public/JS/manual-modal.js (texto sin HTML). */
export interface ManualSection { title: string; icon: string; items: Array<{ title: string; text: string }>; tipsTitle: string | null; tips: string[] }

export const MANUAL_SECTIONS: Record<string, ManualSection> = {
  "periodo": {
    "title": "Instrucciones - Identificación del Período",
    "icon": "fa-info-circle",
    "items": [
      {
        "title": "Mes de Proceso",
        "text": "Seleccione el mes en el que se realiza el proceso de pago. Este dato es fundamental para clasificar y organizar la solicitud dentro del sistema."
      },
      {
        "title": "Fecha de Emisión",
        "text": "Ingrese la fecha en que se emite el documento o formulario. Esta fecha sirve como referencia del momento de inicio del proceso."
      },
      {
        "title": "Fecha Estimada de Pago",
        "text": "Indique la fecha prevista para realizar el pago. Es importante ser realista con esta fecha para facilitar la planificación financiera."
      }
    ],
    "tipsTitle": "Consejos Útiles",
    "tips": [
      "Asegúrate de seleccionar el mes correcto según el período operativo.",
      "Las fechas deben estar en formato válido (DD/MM/AAAA).",
      "La fecha de pago no puede ser anterior a la fecha de emisión.",
      "Estos datos se utilizarán para generar automáticamente la glosa técnica."
    ]
  },
  "entidad": {
    "title": "Instrucciones - Entidad y Clasificación",
    "icon": "fa-info-circle",
    "items": [
      {
        "title": "Empresa Mandante",
        "text": "Seleccione la empresa que realiza la solicitud. Esta información es crucial para identificar la entidad responsable del requerimiento."
      },
      {
        "title": "Unidad de Negocio / Obra",
        "text": "Especifique la unidad de negocio o proyecto asociado. Esto permite clasificar el gasto dentro de la estructura organizacional correcta."
      },
      {
        "title": "Proceso Operativo",
        "text": "Indique el proceso operativo relacionado. El sistema generará automáticamente el código UNE y las cuentas contables asociadas."
      }
    ],
    "tipsTitle": "Consejos Útiles",
    "tips": [
      "Los campos de empresa, unidad y proceso son interdependientes.",
      "El código UNE se genera automáticamente una vez completados estos datos.",
      "Verifica que las cuentas generadas (Objeto y Auxiliar) sean correctas.",
      "No puedes modificar los valores autogenerados; son de referencia."
    ]
  },
  "financiero": {
    "title": "Instrucciones - Detalle Financiero",
    "icon": "fa-info-circle",
    "items": [
      {
        "title": "Numero de Folio",
        "text": "Ingresa el número de folio o identificador del documento. Puede agregar múltiples folios haciendo clic en \"Agregar otro folio\"."
      },
      {
        "title": "Monto",
        "text": "Especifique el monto asociado a cada folio. El sistema calcula automáticamente el total. Usa números sin puntos ni comas."
      },
      {
        "title": "Forma de Pago",
        "text": "Selecciona el método de pago: depósito, vale vista o combinación. Esto determina cómo se procesará la transacción."
      },
      {
        "title": "PDF Asociado",
        "text": "Adjunta los documentos PDF que respaldan el folio. Puedes subir varios archivos. Asegúrate de que sean claros y legibles."
      }
    ],
    "tipsTitle": "Consejos Útiles",
    "tips": [
      "El monto total se calcula automáticamente sumando todos los folios.",
      "Los archivos PDF deben ser legibles y estar en formato correcto.",
      "Verifica los montos antes de enviar; no se pueden editar después.",
      "La glosa técnica se genera automáticamente según el mes seleccionado."
    ]
  },
  "observaciones": {
    "title": "Instrucciones - Observaciones Adicionales",
    "icon": "fa-info-circle",
    "items": [
      {
        "title": "Notas Adicionales",
        "text": "Agrega comentarios o notas que consideres importantes. Estos datos serán visibles para el aprobador y pueden ayudar en la revisión."
      },
      {
        "title": "Campo Opcional",
        "text": "Este campo es completamente opcional. Si no tienes observaciones adicionales, puedes dejar en blanco."
      }
    ],
    "tipsTitle": "Consejos Útiles",
    "tips": [
      "Sé claro y conciso en tus observaciones.",
      "Incluye contexto importante que el aprobador deba saber.",
      "Evita información sensible o datos confidenciales.",
      "Las observaciones pueden acelerar el proceso de aprobación."
    ]
  },
  "solicitudes-columns": {
    "title": "Columnas - Solicitudes",
    "icon": "fa-table",
    "items": [
      {
        "title": "ID",
        "text": "Identificador único de la solicitud. Te ayuda a localizar y referencias específicas."
      },
      {
        "title": "Estado",
        "text": "Situación actual de la solicitud (Esperando, Pendiente, Aprobada, Rechazada, etc.)."
      },
      {
        "title": "Solicitante",
        "text": "Nombre de la persona que realizó la solicitud."
      },
      {
        "title": "Fecha de Proceso",
        "text": "Fecha en que se emitió la solicitud."
      },
      {
        "title": "UNE",
        "text": "Código único de negocio que identifica la entidad y clasificación."
      },
      {
        "title": "Cuenta Objeto",
        "text": "Cuenta contable principal asociada a la solicitud."
      },
      {
        "title": "Código Auxiliar",
        "text": "Código auxiliar que proporciona información adicional de clasificación contable."
      },
      {
        "title": "Proceso",
        "text": "Nombre del proceso operativo asociado a la solicitud."
      },
      {
        "title": "Monto Total",
        "text": "Suma total de todos los folios en la solicitud."
      },
      {
        "title": "Mes / Año",
        "text": "Período contable en el que se registra la solicitud."
      }
    ],
    "tipsTitle": "Información Útil",
    "tips": [
      "Ordena y filtra por cualquier columna para encontrar rápidamente tus solicitudes.",
      "Las columnas sombreadas en color facilitan la agrupación por departamento.",
      "El botón \"Ver Detalles\" te muestra toda la información completa de la solicitud."
    ]
  },
  "recepcionado-columns": {
    "title": "Columnas - Recepcionado",
    "icon": "fa-table",
    "items": [
      {
        "title": "ID",
        "text": "Identificador único del recepcionado. Te ayuda a localizar referencias específicas."
      },
      {
        "title": "Estado",
        "text": "Situación del recepcionado (Recepcionado, Pagado, Pendiente, etc.)."
      },
      {
        "title": "Solicitante",
        "text": "Nombre de la persona que originó la solicitud de pago."
      },
      {
        "title": "Fecha de Pago",
        "text": "Fecha estimada o real en la que se realiza el pago."
      },
      {
        "title": "Detalle",
        "text": "Descripción adicional o comentarios sobre el pago."
      },
      {
        "title": "Obra",
        "text": "Identifica la unidad de negocio u obra asociada al pago."
      },
      {
        "title": "Giro Solicitado",
        "text": "Monto total que se solicita pagar o ha sido pagado."
      },
      {
        "title": "Folio",
        "text": "Número de folio o documento de referencia del pago."
      },
      {
        "title": "Forma de Pago",
        "text": "Método de pago utilizado (Depósito, Vale Vista, etc.)."
      },
      {
        "title": "Mes / Año",
        "text": "Período contable en el que se procesa el pago."
      }
    ],
    "tipsTitle": "Información Útil",
    "tips": [
      "Esta sección muestra el estado financiero y de pago de las solicitudes.",
      "Usa los filtros para localizar pagos por período o forma de pago.",
      "El botón \"Ver Detalles\" proporciona información completa del recepcionado."
    ]
  },
  "todas-solicitudes-columns": {
    "title": "Columnas - Todas las Solicitudes",
    "icon": "fa-list-check",
    "items": [
      {
        "title": "ID",
        "text": "Identificador único de la solicitud."
      },
      {
        "title": "Estado",
        "text": "Situación actual (Pendiente, Aprobado, Recepcionado, etc.)."
      },
      {
        "title": "Detalles",
        "text": "Botón para ver información completa de la solicitud."
      },
      {
        "title": "Solicitante",
        "text": "Nombre de la persona que realizó la solicitud."
      },
      {
        "title": "F. Proceso / UNE / Cuenta / Auxiliar / Proceso / Monto",
        "text": "Datos contables y operacionales (RRHH Group - color púrpura)."
      },
      {
        "title": "F. Emisión / Obra / Folio / Monto por Folio / Forma de Pago",
        "text": "Datos financieros y de pago (Finanzas Group - color azul)."
      },
      {
        "title": "Mes / Año / F. Pago",
        "text": "Período y fecha de pago asociados."
      }
    ],
    "tipsTitle": "Consejos Útiles",
    "tips": [
      "Esta es la vista consolidada de TODAS las solicitudes del sistema.",
      "Usa los filtros en la sección superior para buscar por texto, estado, fechas o montos.",
      "Las columnas en púrpura corresponden a datos de RRHH.",
      "Las columnas en azul corresponden a datos financieros."
    ]
  },
  "solicitudes-recientes-columns": {
    "title": "Columnas - Solicitudes Recientes",
    "icon": "fa-clock",
    "items": [
      {
        "title": "ID",
        "text": "Identificador único de la solicitud."
      },
      {
        "title": "Estado",
        "text": "Situación actual de la solicitud."
      },
      {
        "title": "Solicitante",
        "text": "Nombre de quien realizó la solicitud."
      },
      {
        "title": "F. Proceso / UNE / Cuenta / Auxiliar / Proceso / Monto",
        "text": "Datos contables y montos (RRHH Group - color púrpura)."
      },
      {
        "title": "F. Pago / Detalle / Obra / Folio / Monto por Folio / Forma de Pago",
        "text": "Información de pago y referencia financiera (Finanzas Group - color azul)."
      },
      {
        "title": "Mes / Año",
        "text": "Período contable de la solicitud."
      }
    ],
    "tipsTitle": "Información Útil",
    "tips": [
      "Estas son las solicitudes más recientes registradas en el sistema.",
      "Haz clic en cualquier fila para ver detalles completos.",
      "Los datos están organizados en dos grupos: RRHH (púrpura) y Finanzas (azul)."
    ]
  },
  "admin-empresas-columns": {
    "title": "Columnas - Administración: Empresas",
    "icon": "fa-building",
    "items": [
      {
        "title": "ID",
        "text": "Identificador único de la empresa en el sistema."
      },
      {
        "title": "Empresa",
        "text": "Nombre completo de la empresa mandante."
      },
      {
        "title": "Código",
        "text": "Código único asignado a la empresa para referencia rápida."
      },
      {
        "title": "Acciones",
        "text": "Botones para editar o eliminar el registro de la empresa."
      }
    ],
    "tipsTitle": "Consejos Útiles",
    "tips": [
      "Las empresas son mandantes del sistema que generan solicitudes de pago.",
      "El código es un identificador único para operaciones internas.",
      "Usa la opción Editar para actualizar datos de la empresa.",
      "Usa la opción Eliminar solo si la empresa no tiene solicitudes asociadas."
    ]
  },
  "admin-procesos-aux-columns": {
    "title": "Columnas - Administración: Procesos Auxiliares",
    "icon": "fa-hard-hat",
    "items": [
      {
        "title": "ID",
        "text": "Identificador único del proceso auxiliar u obra."
      },
      {
        "title": "Proceso Auxiliar / Obra",
        "text": "Nombre del proyecto, obra o actividad auxiliar."
      },
      {
        "title": "Descripción",
        "text": "Información adicional sobre el proceso auxiliar."
      },
      {
        "title": "Empresa",
        "text": "Empresa mandante asociada a este proceso auxiliar."
      },
      {
        "title": "Acciones",
        "text": "Botones para editar o eliminar el registro."
      }
    ],
    "tipsTitle": "Información Útil",
    "tips": [
      "Los procesos auxiliares representan obras, proyectos o líneas de negocio.",
      "Cada proceso auxiliar está vinculado a una empresa específica.",
      "Usa la descripción para detalles específicos del proyecto."
    ]
  },
  "admin-procesos-columns": {
    "title": "Columnas - Administración: Procesos",
    "icon": "fa-cogs",
    "items": [
      {
        "title": "ID",
        "text": "Identificador único del proceso."
      },
      {
        "title": "Nombre del Proceso",
        "text": "Nombre descriptivo del proceso operativo."
      },
      {
        "title": "Descripción",
        "text": "Detalles adicionales y características del proceso."
      },
      {
        "title": "Empresa",
        "text": "Empresa mandante que utiliza este proceso."
      },
      {
        "title": "Acciones",
        "text": "Botones para editar o eliminar el registro del proceso."
      }
    ],
    "tipsTitle": "Consejos Útiles",
    "tips": [
      "Los procesos definen las actividades o servicios disponibles.",
      "Al crear una solicitud, se selecciona uno de estos procesos.",
      "Cada proceso está asociado a una empresa específica."
    ]
  },
  "admin-usuarios-columns": {
    "title": "Columnas - Administración: Usuarios",
    "icon": "fa-users",
    "items": [
      {
        "title": "ID",
        "text": "Identificador único del usuario en el sistema."
      },
      {
        "title": "Nombre de Usuario",
        "text": "Nombre completo del usuario."
      },
      {
        "title": "Email",
        "text": "Correo electrónico de contacto del usuario."
      },
      {
        "title": "Rol",
        "text": "Rol del usuario en el sistema (Solicitante, Jefe de Recursos Humanos, Subgerente de Capital Humano, Jefe de Finanzas, Admin)."
      },
      {
        "title": "Cargo",
        "text": "Posición u cargo del usuario en la organización."
      },
      {
        "title": "Empresa",
        "text": "Empresa a la que pertenece el usuario."
      },
      {
        "title": "Acciones",
        "text": "Botones para editar o eliminar el usuario del sistema."
      }
    ],
    "tipsTitle": "Información Importante",
    "tips": [
      "Los roles determinan qué acciones puede realizar cada usuario.",
      "Solicitante: Crea solicitudes de pago.",
      "Jefe de Recursos Humanos / Subgerente de Capital Humano: Aprueban solicitudes en niveles.",
      "Jefe de Finanzas: Gestiona pagos y registro de recepcionados.",
      "Admin: Acceso total al sistema."
    ]
  },
  "aprobaciones-columns": {
    "title": "Columnas - Aprobaciones Pendientes",
    "icon": "fa-check-square",
    "items": [
      {
        "title": "Checkbox Selección",
        "text": "Marca las solicitudes que deseas aprobar. Usa \"Seleccionar Todo\" para marcar múltiples solicitudes de una empresa."
      },
      {
        "title": "ID",
        "text": "Identificador único de la solicitud. Facilita la referencia y rastreo del documento."
      },
      {
        "title": "Solicitante",
        "text": "Nombre de la persona que realizó la solicitud de pago."
      },
      {
        "title": "Proceso",
        "text": "Nombre del proceso o actividad asociado al pago solicitado."
      },
      {
        "title": "F. Proceso",
        "text": "Fecha en que se realizó el proceso pago (RRHH Group - color púrpura)."
      },
      {
        "title": "UNE / Cuenta / Auxiliar",
        "text": "Unidad de negocio, cuenta contable y código auxiliar (RRHH Group - color púrpura)."
      },
      {
        "title": "Monto",
        "text": "Cantidad de dinero solicitada para el pago (RRHH Group - color púrpura)."
      },
      {
        "title": "Estado",
        "text": "Situación actual de la solicitud (Pendiente, Aprobado Nivel 1, etc.)."
      },
      {
        "title": "Detalles",
        "text": "Botón para ver información completa de la solicitud."
      },
      {
        "title": "Acciones",
        "text": "Botones para aprobar, rechazar o devolver la solicitud con comentarios."
      }
    ],
    "tipsTitle": "Consejos Útiles",
    "tips": [
      "Usa los filtros (Año, Mes, F. Pago) para localizar solicitudes específicas.",
      "Las columnas en púrpura corresponden al grupo RRHH con datos contables.",
      "Puedes aprobar múltiples solicitudes seleccionándolas y haciendo clic en \"Aprobar Múltiples\".",
      "La revisión de detalles es importante antes de aprobar una solicitud."
    ]
  },
  "finanzas-columns": {
    "title": "Columnas - Gestión Finanzas",
    "icon": "fa-wallet",
    "items": [
      {
        "title": "ID",
        "text": "Identificador único de la solicitud de pago."
      },
      {
        "title": "Solicitante",
        "text": "Nombre de la persona que elaboró la solicitud."
      },
      {
        "title": "Proceso",
        "text": "Descripción del proceso o actividad asociada al pago."
      },
      {
        "title": "F. Proceso",
        "text": "Fecha en que se registró el proceso."
      },
      {
        "title": "UNE / Cuenta / Auxiliar",
        "text": "Unidad de negocio, número de cuenta y código auxiliar para clasificación contable."
      },
      {
        "title": "Monto",
        "text": "Valor total de la solicitud de pago."
      },
      {
        "title": "Fecha de Pago",
        "text": "Fecha en que se realizó o se realizará el pago (Finanzas Group - color azul)."
      },
      {
        "title": "Detalle / Obra / Forma de Pago",
        "text": "Información adicional, obra asociada e método de pago (Finanzas Group - color azul)."
      },
      {
        "title": "Folio",
        "text": "Número de folio de documento de referencia."
      },
      {
        "title": "Estado",
        "text": "Situación actual del pago (Aprobado Nivel 2, Recepcionado, etc.)."
      }
    ],
    "tipsTitle": "Consejos Útiles",
    "tips": [
      "Esta sección es para gestionar pagos que ya han sido aprobados en RRHH.",
      "Las columnas en azul corresponden al grupo de Finanzas con detalles de pago.",
      "Revisa la Fecha de Pago para coordinar con tesorería.",
      "Usa los filtros para buscar pagos por período o forma de pago."
    ]
  },
  "recepcionados-columns": {
    "title": "Columnas - Recepcionados",
    "icon": "fa-check-circle",
    "items": [
      {
        "title": "ID",
        "text": "Identificador único del documento recepcionado."
      },
      {
        "title": "Modificar",
        "text": "Botón para editar datos del recepcionado (solo si aún no está pagado)."
      },
      {
        "title": "Estado",
        "text": "Situación del recepcionado (Recepcionado, Pagado)."
      },
      {
        "title": "Solicitante",
        "text": "Nombre de la persona que realizó la solicitud original."
      },
      {
        "title": "F. Solicitud",
        "text": "Fecha en que se originó la solicitud (RRHH Group - color púrpura)."
      },
      {
        "title": "Unidad / Cuenta / Auxiliar",
        "text": "UNE, cuenta contable y código auxiliar para clasificación (RRHH Group - color púrpura)."
      },
      {
        "title": "Proceso / Monto",
        "text": "Descripción del proceso y valor del pago (RRHH Group - color púrpura)."
      },
      {
        "title": "Fecha de Pago",
        "text": "Fecha en que fue o será pagado (Finanzas Group - color azul)."
      },
      {
        "title": "Detalle / Obra / Giro / Forma de Pago",
        "text": "Información adicional, obra, giro solicitado e método de pago (Finanzas Group - color azul)."
      },
      {
        "title": "Folio / PDF Firmado",
        "text": "Número de folio de referencia e indicador de PDF firmado."
      }
    ],
    "tipsTitle": "Información Útil",
    "tips": [
      "Esta sección muestra solicitudes que han completado todas las aprobaciones.",
      "Las columnas en púrpura son datos de RRHH y contables.",
      "Las columnas en azul contienen información financiera y de pago.",
      "Usa los filtros (Año, Mes, F. Pago, Estado) para localizar registros específicos."
    ]
  }
};
