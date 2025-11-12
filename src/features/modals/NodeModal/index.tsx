import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, TextInput, Group } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";
import { contentToJson, jsonToContent } from "../../../lib/utils/jsonAdapter";
import { toast } from "react-hot-toast";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const getContents = useFile(state => state.getContents);
  const getFormat = useFile(state => state.getFormat);
  const setContents = useFile(state => state.setContents);

  const [editing, setEditing] = React.useState(false);
  const [fields, setFields] = React.useState<Array<{ key: string | null; value: string; type: string }>>([]);

  React.useEffect(() => {
    // Reset edit state when modal opens/closes or node changes
    setEditing(false);
    const rows = nodeData?.text ?? [];
    const initial = rows
      .filter(r => r.type !== "array" && r.type !== "object")
      .map(r => ({ key: r.key ?? null, value: String(r.value ?? ""), type: String(r.type) }));
    
    setFields(initial);
  }, [nodeData, opened]);

  const handleEdit = () => setEditing(true);

  const handleCancel = () => {
    // revert
    const rows = nodeData?.text ?? [];
    const initial = rows
      .filter(r => r.type !== "array" && r.type !== "object")
      .map(r => ({ key: r.key ?? null, value: String(r.value ?? ""), type: String(r.type) }));

    setFields(initial);
    setEditing(false);
  };

  const handleChange = (index: number, value: string) => {
    setFields(prev => prev.map((f, i) => (i === index ? { ...f, value } : f)));
  };

  const setAtPath = (obj: any, path: any[], value: any) => {
    if (!path || path.length === 0) return value;
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      if (cur[seg] === undefined) cur[seg] = typeof path[i + 1] === "number" ? [] : {};
      cur = cur[seg];
    }
    cur[path[path.length - 1]] = value;
    return obj;
  };

  const handleSave = async () => {
    if (!nodeData) return;

    try {
      const contents = getContents();
      const format = getFormat();
      const json = await contentToJson(contents, format);

      // If node points to an object (multiple rows with keys), set child properties
      if (nodeData.text.length > 1 || (nodeData.text.length === 1 && nodeData.text[0].key)) {
        // target object
        const target = nodeData.path && nodeData.path.length > 0 ? nodeData.path : [];
        // resolve target reference
        let parent = json;
        for (const seg of target) {
          parent = parent[seg as any];
        }

        fields.forEach((f, idx) => {
          if (f.key) {
            let newVal: any = f.value;
            if (f.type === "number") newVal = Number(f.value);
            if (f.type === "boolean") newVal = f.value === "true";
            if (f.type === "null") newVal = null;
            parent[f.key] = newVal;
          }
        });
      } else {
        // single primitive value — set at nodeData.path
        const f = fields[0];
        let newVal: any = f.value;
        if (f.type === "number") newVal = Number(f.value);
        if (f.type === "boolean") newVal = f.value === "true";
        if (f.type === "null") newVal = null;
        setAtPath(json, nodeData.path ?? [], newVal);
      }

      const contentStr = await jsonToContent(JSON.stringify(json, null, 2), format);
      await setContents({ contents: contentStr });
      setEditing(false);
      toast.success("Saved changes");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to save changes");
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Group spacing="xs">
              {!editing && (
                <Button size="xs" variant="outline" onClick={handleEdit} disabled={!nodeData}>
                  Edit
                </Button>
              )}
              {editing && (
                <>
                  <Button size="xs" color="green" onClick={handleSave}>
                    Save
                  </Button>
                  <Button size="xs" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                </>
              )}
              <CloseButton onClick={onClose} />
            </Group>
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {!editing ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <Stack spacing="xs">
                {fields.map((f, i) => (
                  <TextInput
                    key={i}
                    label={f.key ?? "value"}
                    value={f.value}
                    onChange={e => handleChange(i, e.currentTarget.value)}
                    size="xs"
                  />
                ))}
              </Stack>
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
