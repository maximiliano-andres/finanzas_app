#!/usr/bin/env python3
"""
Script de validación del workflow de seguridad
Verifica que todas las herramientas y archivos estén configurados correctamente
"""

import os
import json
import subprocess
from pathlib import Path


def check_file_exists(path, description):
    """Verifica si un archivo existe"""
    if os.path.exists(path):
        print(f"✅ {description}: {path}")
        return True
    else:
        print(f"❌ {description} NO ENCONTRADO: {path}")
        return False


def check_command_exists(command, description):
    """Verifica si un comando está disponible"""
    result = subprocess.run(['which', command], capture_output=True)
    if result.returncode == 0:
        print(f"✅ {description}: {command}")
        return True
    else:
        print(f"❌ {description} NO ENCONTRADO: {command}")
        return False


def validate_requirements():
    """Valida que requirements.txt sea parseble"""
    if not os.path.exists('requirements.txt'):
        print("❌ requirements.txt no encontrado")
        return False
    
    try:
        with open('requirements.txt', 'r') as f:
            lines = f.readlines()
            valid_lines = [l.strip() for l in lines if l.strip() and not l.strip().startswith('#')]
            print(f"✅ requirements.txt válido: {len(valid_lines)} paquetes")
            return True
    except Exception as e:
        print(f"❌ Error en requirements.txt: {e}")
        return False


def validate_workflow_yaml():
    """Valida la estructura del workflow YAML"""
    workflow_path = '.github/workflows/security-workflow.yml'
    
    if not os.path.exists(workflow_path):
        print(f"❌ Workflow no encontrado: {workflow_path}")
        return False
    
    try:
        import yaml
        with open(workflow_path, 'r') as f:
            data = yaml.safe_load(f)
            
        # Verificar estructura básica
        required_keys = ['name', 'on', 'jobs']
        for key in required_keys:
            if key not in data:
                print(f"❌ Workflow YAML falta clave: {key}")
                return False
        
        # Verificar jobs
        jobs = data.get('jobs', {})
        required_jobs = ['changes', 'safety', 'pip-audit', 'report']
        for job in required_jobs:
            if job not in jobs:
                print(f"❌ Workflow YAML falta job: {job}")
                return False
        
        print(f"✅ Workflow YAML válido: {len(jobs)} jobs configurados")
        return True
        
    except ImportError:
        print("⚠️  PyYAML no instalado, ignorando validación YAML")
        return True
    except Exception as e:
        print(f"❌ Error validando workflow YAML: {e}")
        return False


def main():
    print("\n" + "="*60)
    print("🔒 Validador de Workflow de Seguridad - FlujoPago")
    print("="*60 + "\n")
    
    checks = []
    
    print("📋 Verificando estructura del proyecto...\n")
    checks.append(check_file_exists('requirements.txt', 'Archivo de dependencias'))
    checks.append(check_file_exists('.github/workflows/security-workflow.yml', 'Workflow de seguridad'))
    checks.append(check_file_exists('.github/scripts/generate_security_report.py', 'Script generador de reportes'))
    
    print("\n🔍 Validando archivos de configuración...\n")
    checks.append(validate_requirements())
    checks.append(validate_workflow_yaml())
    
    print("\n📦 Verificando herramientas disponibles...\n")
    checks.append(check_command_exists('python3', 'Python 3'))
    checks.append(check_command_exists('git', 'Git'))
    
    print("\n📊 Resumen de validación:\n")
    passed = sum(checks)
    total = len(checks)
    print(f"Verificaciones exitosas: {passed}/{total}")
    
    if passed == total:
        print("\n✅ ¡TODAS LAS VERIFICACIONES PASARON!")
        print("\n📌 Próximos pasos:")
        print("   1. Hacer commit de los cambios al workflow")
        print("   2. Push a una rama monitoreada (main, Maximiliano, etc.)")
        print("   3. El workflow se ejecutará automáticamente")
        print("   4. Descargar el reporte desde Artifacts en GitHub Actions")
        return 0
    else:
        print(f"\n⚠️  {total - passed} verificación(es) fallaron")
        print("\n📌 Soluciones:")
        print("   - Instala PyYAML: pip install pyyaml")
        print("   - Verifica que todos los archivos estén en su lugar")
        print("   - Revisa la estructura de directorios .github/workflows/")
        return 1


if __name__ == "__main__":
    exit(main())
