alter function public.mallard_get_classification_numbers() security invoker;
alter function public.mallard_get_classification_numbers() set search_path = '';
revoke execute on function public.mallard_get_classification_numbers() from public;
grant execute on function public.mallard_get_classification_numbers() to anon, authenticated;

comment on function public.mallard_get_classification_numbers() is
  'Read-only classification numbering helper. SECURITY INVOKER by design; callers are limited by Mallard table grants and RLS.';
