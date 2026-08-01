import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dogs/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dogs",
      search: { details: params.id },
    });
  },
});
