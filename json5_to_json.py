#!/usr/bin/env python3
"""
Convert JSON5 format to standard JSON
Handles comments, trailing commas, and unquoted keys
"""
import re
import sys
import json

def convert_json5_to_json(content):
    """Convert JSON5 content to valid JSON"""
    # Remove single-line comments (but not URLs with //)
    lines = content.split('\n')
    cleaned_lines = []
    for line in lines:
        # Check if line contains a comment
        # Only remove // if it's not inside a string
        in_string = False
        quote_char = None
        comment_start = -1

        for i, char in enumerate(line):
            if char in ('"', "'") and (i == 0 or line[i-1] != '\\'):
                if not in_string:
                    in_string = True
                    quote_char = char
                elif char == quote_char:
                    in_string = False
                    quote_char = None
            elif char == '/' and i < len(line) - 1 and line[i+1] == '/' and not in_string:
                comment_start = i
                break

        if comment_start >= 0:
            cleaned_lines.append(line[:comment_start])
        else:
            cleaned_lines.append(line)

    content = '\n'.join(cleaned_lines)

    # Remove multi-line comments
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)

    # Quote unquoted keys (key: value -> "key": value)
    # Match word characters followed by colon, not inside quotes
    content = re.sub(r'(\n\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1"\2":', content)

    # Remove trailing commas before } or ]
    content = re.sub(r',(\s*[}\]])', r'\1', content)

    return content

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: json5_to_json.py <input_file>", file=sys.stderr)
        sys.exit(1)

    input_file = sys.argv[1]

    try:
        with open(input_file, 'r') as f:
            content = f.read()

        json_content = convert_json5_to_json(content)

        # Validate the JSON
        json.loads(json_content)

        # Output the converted JSON
        print(json_content)

    except FileNotFoundError:
        print(f"Error: File '{input_file}' not found", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Failed to convert to valid JSON: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

