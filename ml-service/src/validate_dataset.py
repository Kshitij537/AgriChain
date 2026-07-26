import argparse
import sys
from validation import (
    run_integrity_check,
    run_duplicate_check,
    generate_manifest,
    run_statistics,
    run_freeze
)
from validation.common import log_message

def main():
    parser = argparse.ArgumentParser(description="AgriChain Dataset Validation Pipeline")
    parser.add_argument("--integrity", action="store_true", help="Run image integrity checks")
    parser.add_argument("--duplicates", action="store_true", help="Run duplicate checking")
    parser.add_argument("--metadata", action="store_true", help="Generate dataset manifest CSV")
    parser.add_argument("--stats", action="store_true", help="Generate dataset statistics JSON")
    parser.add_argument("--freeze", action="store_true", help="Freeze dataset and checksums")
    parser.add_argument("--all", action="store_true", help="Run all validation phases")
    
    args = parser.parse_args()
    
    # If no flags are set, default to all
    run_all = args.all or not (args.integrity or args.duplicates or args.metadata or args.stats or args.freeze)
    
    log_message("==================================================")
    log_message("AgriChain Dataset Validation Pipeline Started")
    log_message("==================================================")
    
    success = True
    
    try:
        if run_all or args.integrity:
            success = run_integrity_check() and success
            
        if run_all or args.duplicates:
            success = run_duplicate_check() and success
            
        if run_all or args.metadata:
            success = generate_manifest() and success
            
        if run_all or args.stats:
            success = run_statistics() and success
            
        if run_all or args.freeze:
            success = run_freeze() and success
            
        if success:
            log_message("Dataset validation completed successfully. No critical errors found.")
        else:
            log_message("Dataset validation completed with warnings/errors. Please review reports.")
            
    except Exception as e:
        log_message(f"Fatal error encountered during validation pipeline: {str(e)}")
        sys.exit(1)
        
    log_message("==================================================")
    log_message("AgriChain Dataset Validation Pipeline Completed")
    log_message("==================================================")

if __name__ == "__main__":
    main()
