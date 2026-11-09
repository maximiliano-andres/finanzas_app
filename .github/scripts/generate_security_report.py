#!/usr/bin/env python3
"""
Generador de Reporte de Seguridad Profesional
Analiza vulnerabilidades de dependencias y genera un informe detallado
"""

import json
import os
import sys
from datetime import datetime
from collections import defaultdict
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Table,
    TableStyle,
    Spacer,
    PageBreak,
    ListFlowable,
    ListItem,
)
from reportlab.lib.enums import TA_CENTER


class SecurityReportGenerator:
    def __init__(self):
        self.timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        self.pdf_filename = f"security-report-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.pdf"
        self.vulnerabilities = defaultdict(list)
        self.outdated_packages = []

        self.stats = {
            "total_vulnerabilities": 0,
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0,
            "unknown": 0,
        }

        self.severity_map = {
            "CRÍTICO": "critical",
            "ALTO": "high",
            "MEDIO": "medium",
            "BAJO": "low",
            "DESCONOCIDO": "unknown",
            "INFORMACIÓN": "unknown",
        }

    # --------------------------------------------------
    # Utils
    # --------------------------------------------------
    def load_json_report(self, path):
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            print(f"Advertencia: no se pudo cargar {path}: {e}")
        return {}

    def get_cvss_severity(self, score):
        try:
            score = float(score)
        except Exception:
            return "DESCONOCIDO", 5

        if score >= 9.0:
            return "CRÍTICO", 1
        if score >= 7.0:
            return "ALTO", 2
        if score >= 4.0:
            return "MEDIO", 3
        if score > 0:
            return "BAJO", 4
        return "INFORMACIÓN", 5

    # --------------------------------------------------
    # Data processing
    # --------------------------------------------------
    def process_pip_audit_vulnerabilities(self, data):
        for pkg in data.get("vulnerabilities", []):
            for vuln in pkg.get("vulns", []):
                severity, priority = self.get_cvss_severity(
                    vuln.get("cvss", {}).get("score")
                )

                key = self.severity_map.get(severity, "unknown")
                self.stats[key] += 1
                self.stats["total_vulnerabilities"] += 1

                self.vulnerabilities[pkg["name"]].append(
                    {
                        "package": pkg["name"],
                        "current_version": pkg["version"],
                        "vulnerability_id": vuln.get("id", "N/A"),
                        "description": vuln.get("description", "Sin descripción"),
                        "cvss_score": vuln.get("cvss", {}).get("score"),
                        "severity": severity,
                        "priority": priority,
                        "fixed_versions": vuln.get("fixed_versions", []),
                    }
                )

    def process_safety_vulnerabilities(self, data):
        for vuln in data.get("vulnerabilities", []):
            severity = vuln.get("severity", "DESCONOCIDO").upper()
            key = self.severity_map.get(severity, "unknown")

            self.stats[key] += 1
            self.stats["total_vulnerabilities"] += 1

            self.vulnerabilities[vuln["package"]].append(
                {
                    "package": vuln["package"],
                    "current_version": vuln.get("installed_version"),
                    "vulnerability_id": vuln.get("cve", "N/A"),
                    "description": vuln.get("vulnerability", ""),
                    "cvss_score": vuln.get("cvss_score"),
                    "severity": severity,
                    "priority": 5,
                    "fixed_versions": vuln.get("safe_versions", []),
                }
            )

    def process_outdated_packages(self, data):
        for pkg in data:
            self.outdated_packages.append(
                {
                    "package": pkg.get("name"),
                    "current_version": pkg.get("version"),
                    "latest_version": pkg.get("latest_version"),
                }
            )

    # --------------------------------------------------
    # PDF generation
    # --------------------------------------------------
    def format_critical_vulnerability(self, vuln):
        """Format a critical vulnerability for the PDF report"""
        cve = vuln.get("vulnerability_id", "N/A")
        desc = vuln.get("description", "Sin descripción")
        fixed = ", ".join(vuln.get("fixed_versions", [])) or "Ninguna disponible"
        
        info = [
            f"<b>Librería Afectada:</b> {vuln['package']} (v{vuln['current_version']})",
            f"<b>Recomendación (Versión Segura):</b> {fixed}",
            f"<b>CVE Asociado:</b> {cve}",
            f"<b>Impacto Potencial:</b> {desc}"
        ]
        return "<br/>".join(info)

    def build_pdf(self):
        doc = SimpleDocTemplate(
            self.pdf_filename,
            pagesize=letter,
            leftMargin=0.75 * inch,
            rightMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )

        styles = getSampleStyleSheet()
        story = []

        title_style = ParagraphStyle(
            "Title",
            parent=styles["Heading1"],
            fontSize=26,
            alignment=TA_CENTER,
        )

        story.append(Paragraph("REPORTE DE SEGURIDAD", title_style))
        story.append(Spacer(1, 0.3 * inch))
        story.append(Paragraph(f"Generado: {self.timestamp}", styles["Normal"]))
        story.append(Spacer(1, 0.4 * inch))

        # --------------------------------------------------
        # Resumen
        # --------------------------------------------------
        summary = [
            ["Métrica", "Cantidad"],
            ["CRÍTICAS", self.stats["critical"]],
            ["ALTAS", self.stats["high"]],
            ["MEDIAS", self.stats["medium"]],
            ["BAJAS", self.stats["low"]],
            ["DESCONOCIDAS", self.stats["unknown"]],
            ["TOTAL", self.stats["total_vulnerabilities"]],
        ]

        table = Table(summary, colWidths=[3 * inch, 2 * inch])
        table.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 1, colors.grey),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#d32f2f")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ]
            )
        )

        story.append(table)

        # --------------------------------------------------
        # Vulnerabilidades Críticas (Detalle)
        # --------------------------------------------------
        if self.stats["critical"] > 0:
            story.append(PageBreak())
            story.append(Paragraph("DETALLE DE VULNERABILIDADES CRÍTICAS", styles["Heading1"]))
            story.append(Spacer(1, 0.2 * inch))
            
            critical_items = []
            for pkg_name, vulns in self.vulnerabilities.items():
                for vuln in vulns:
                    if vuln.get("severity") in ["CRÍTICO", "critical", "CRITICAL"]:
                        # Formato de alerta para críticas
                        alert_style = ParagraphStyle(
                            "CriticalAlert",
                            parent=styles["Normal"],
                            textColor=colors.HexColor("#b71c1c"),
                            backColor=colors.HexColor("#ffcdd2"),
                            borderPadding=10,
                            borderColor=colors.HexColor("#d32f2f"),
                            borderWidth=1
                        )
                        critical_info = self.format_critical_vulnerability(vuln)
                        critical_items.append(
                            ListItem(Paragraph(critical_info, alert_style))
                        )
                        critical_items.append(Spacer(1, 0.1 * inch))
            
            if critical_items:
                critical_list = ListFlowable(
                    critical_items,
                    bulletType="bullet",
                    start="circle",
                    leftIndent=18,
                )
                story.append(critical_list)

        # --------------------------------------------------
        # Recomendaciones (LISTA REAL)
        # --------------------------------------------------
        story.append(PageBreak())
        story.append(Paragraph("RECOMENDACIONES", styles["Heading1"]))
        story.append(Spacer(1, 0.2 * inch))

        recommendations = ListFlowable(
            [
                ListItem(Paragraph(
                    "<b>CRÍTICAS:</b> Actualizar inmediatamente (hotfix).",
                    styles["Normal"]
                )),
                ListItem(Paragraph(
                    "<b>ALTAS:</b> Corregir en el próximo sprint.",
                    styles["Normal"]
                )),
                ListItem(Paragraph(
                    "<b>MEDIAS:</b> Incluir en mantenimiento planificado.",
                    styles["Normal"]
                )),
                ListItem(Paragraph(
                    "<b>BAJAS:</b> Monitorear sin urgencia.",
                    styles["Normal"]
                )),
                ListItem(Paragraph(
                    "<b>DESACTUALIZADAS:</b> Mantener dependencias actualizadas.",
                    styles["Normal"]
                )),
            ],
            bulletType="bullet",
            start="circle",
            leftIndent=18,
        )

        story.append(recommendations)

        doc.build(story)
        print(f"✓ PDF generado correctamente: {self.pdf_filename}")

    # --------------------------------------------------
    # Main
    # --------------------------------------------------
    def generate(self):
        print("🔒 Generando reporte de seguridad...")

        self.process_pip_audit_vulnerabilities(
            self.load_json_report("pip-audit-report/audit-report.json")
        )
        self.process_safety_vulnerabilities(
            self.load_json_report("safety-report/safety-report.json")
        )
        self.process_outdated_packages(
            self.load_json_report("outdated-report/outdated.json")
        )

        self.build_pdf()
        
        if self.stats["critical"] > 0:
            print(f"❌ ATENCIÓN: Se han detectado {self.stats['critical']} vulnerabilidades CRÍTICAS.")
            print("El proceso fallará (exit 1) para bloquear el merge.")
            return self.pdf_filename, False

        return self.pdf_filename, True


if __name__ == "__main__":
    try:
        report_file, success = SecurityReportGenerator().generate()
        if not success:
            print("❌ Proceso fallido debido a vulnerabilidades críticas.")
            sys.exit(1)
        print("✅ Proceso completado exitosamente sin vulnerabilidades críticas.")
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
