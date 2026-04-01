interface ImportMeta {
  readonly env: {
    readonly BASE_URL: string;
    readonly [key: string]: string | undefined;
  };
}
