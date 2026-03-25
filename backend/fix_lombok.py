import os
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # If no Lombok annotations, skip
    if '@Data' not in content and '@Builder' not in content:
        return
        
    print(f"Processing {filepath}")
    
    # Remove lombok imports and annotations
    content = re.sub(r'import lombok\..*?;\n', '', content)
    content = re.sub(r'@Data\s*\n', '', content)
    content = re.sub(r'@Builder\s*\n', '', content)
    content = re.sub(r'@NoArgsConstructor\s*\n', '', content)
    content = re.sub(r'@AllArgsConstructor\s*\n', '', content)
    
    # Extract class name and fields
    class_match = re.search(r'public class (\w+)(.*?){', content, re.DOTALL)
    if not class_match:
        return
        
    class_name = class_match.group(1)
    body_start_idx = class_match.end()
    
    # Simple regex for private fields (ignoring initialized values or complex stuff for MVP)
    # Assumes fields like `private Type name;` or `private Type name = ...;`
    field_pattern = r'private\s+([\w<>,\s]+)\s+(\w+)(?:\s*=\s*[^;]+)?;'
    fields = re.findall(field_pattern, content)
    
    # Generate getters, setters, no args, all args constructors
    # For Builder, we will just not use Builder if possible, or generate a simple Builder
    getters_setters = "\n"
    
    for ftype, fname in fields:
        ftype = ftype.strip()
        fname = fname.strip()
        
        # Capitalize first letter
        if fname.startswith("is") and ftype == "boolean":
            # For 'boolean isAlive', getter is 'isAlive()', setter is 'setAlive()'
            cap_name = fname[2:] if len(fname) > 2 else fname
            getter = f"    public {ftype} {fname}() {{\n        return this.{fname};\n    }}\n"
            setter = f"    public void set{cap_name}({ftype} {fname}) {{\n        this.{fname} = {fname};\n    }}\n"
        else:
            cap_name = fname[0].upper() + fname[1:]
            if ftype == "boolean":
                getter = f"    public {ftype} is{cap_name}() {{\n        return this.{fname};\n    }}\n"
            else:
                getter = f"    public {ftype} get{cap_name}() {{\n        return this.{fname};\n    }}\n"
            setter = f"    public void set{cap_name}({ftype} {fname}) {{\n        this.{fname} = {fname};\n    }}\n"
            
        getters_setters += getter + setter
        
    # Constructors
    no_args = f"    public {class_name}() {{}}\n"
    args_list = ", ".join([f"{ftype.strip()} {fname.strip()}" for ftype, fname in fields])
    all_args = f"    public {class_name}({args_list}) {{\n"
    for _, fname in fields:
        fname = fname.strip()
        all_args += f"        this.{fname} = {fname};\n"
    all_args += "    }\n"
    
    # Builder
    builder_class = f"""
    public static {class_name}Builder builder() {{
        return new {class_name}Builder();
    }}
    public static class {class_name}Builder {{
"""
    for ftype, fname in fields:
        ftype = ftype.strip()
        fname = fname.strip()
        builder_class += f"        private {ftype} {fname};\n"
    builder_class += "\n"
    for ftype, fname in fields:
        ftype = ftype.strip()
        fname = fname.strip()
        builder_class += f"        public {class_name}Builder {fname}({ftype} {fname}) {{\n            this.{fname} = {fname};\n            return this;\n        }}\n"
    
    builder_class += f"        public {class_name} build() {{\n            return new {class_name}(" + ", ".join([f[1].strip() for f in fields]) + ");\n        }\n    }\n"
    
    insertion_point = content.rfind('}')
    if insertion_point != -1:
        new_content = content[:insertion_point] + no_args + all_args + getters_setters + builder_class + content[insertion_point:]
        with open(filepath, 'w') as f:
            f.write(new_content)

for root, _, files in os.walk('d:/Project Backups/Gonosia/backend/src/main/java'):
    for file in files:
        if file.endswith('.java'):
            process_file(os.path.join(root, file))
